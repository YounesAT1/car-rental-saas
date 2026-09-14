import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { source } from "./operationsValidators";
import {
  base,
  fail,
  requireGuard,
  revision,
  refreshSchedules,
  operationAudit,
} from "./operations";
import {
  distanceMeters,
  MAX_METERS,
  textValue,
} from "../../src/lib/operations";

export type MileageInput = {
  value: number;
  unit: "km" | "mi";
  observedAt: number;
  reason: string;
  supersedesId?: Id<"vehicleMileageLogs">;
  expectedRevision: number;
  replacement: boolean;
  priorLifetimeMeters?: number;
};
export async function writeMileage(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  actorId: Id<"users">,
  input: MileageInput,
  origin: Infer<typeof source>,
) {
  const guard = await requireGuard(ctx, agencyId, vehicleId);
  const raw = distanceMeters(input.value, input.unit);
  if (
    !Number.isSafeInteger(input.observedAt) ||
    input.observedAt < 0 ||
    input.observedAt > Date.now()
  )
    fail();
  const old = input.supersedesId ? await ctx.db.get(input.supersedesId) : null;
  if (input.supersedesId) {
    if (
      !old ||
      old.agencyId !== agencyId ||
      old.vehicleId !== vehicleId ||
      !old.active
    )
      fail("OPERATIONS_CONFLICT");
    revision(old, input.expectedRevision);
    if (old.kind === "replacement" && guard.latestMileageId !== old._id)
      fail("MILEAGE_EPOCH_CONFLICT");
    if (old.observedAt !== input.observedAt) fail();
    await ctx.db.patch(old._id, { active: false, revision: old.revision + 1 });
  }
  const same = await ctx.db
    .query("vehicleMileageLogs")
    .withIndex("by_agency_vehicle_active_observed", (q) =>
      q
        .eq("agencyId", agencyId)
        .eq("vehicleId", vehicleId)
        .eq("active", true)
        .eq("observedAt", input.observedAt),
    )
    .take(1);
  if (same.length) fail("MILEAGE_TIME_CONFLICT");
  const previous = await ctx.db
    .query("vehicleMileageLogs")
    .withIndex("by_agency_vehicle_active_observed", (q) =>
      q
        .eq("agencyId", agencyId)
        .eq("vehicleId", vehicleId)
        .eq("active", true)
        .lt("observedAt", input.observedAt),
    )
    .order("desc")
    .first();
  const next = await ctx.db
    .query("vehicleMileageLogs")
    .withIndex("by_agency_vehicle_active_observed", (q) =>
      q
        .eq("agencyId", agencyId)
        .eq("vehicleId", vehicleId)
        .eq("active", true)
        .gt("observedAt", input.observedAt),
    )
    .first();
  let offset = previous?.offset ?? 0;
  if (input.replacement) {
    const prior = input.priorLifetimeMeters;
    if (
      next ||
      prior === undefined ||
      !Number.isSafeInteger(prior) ||
      prior < (previous?.meters ?? 0) ||
      prior < raw ||
      prior > MAX_METERS
    )
      fail("MILEAGE_INVALID");
    offset = prior - raw;
  } else if (old?.kind === "replacement") fail("MILEAGE_EPOCH_CONFLICT");
  const meters = raw + offset;
  if (
    meters > MAX_METERS ||
    (previous && meters < previous.meters) ||
    (next && meters > next.meters)
  )
    fail("MILEAGE_INVALID");
  const reason = textValue(input.reason, 500, !!old || input.replacement);
  const id = await ctx.db.insert("vehicleMileageLogs", {
    ...base(agencyId, actorId),
    vehicleId,
    value: input.value,
    unit: input.unit,
    meters,
    offset,
    observedAt: input.observedAt,
    active: true,
    kind: input.replacement
      ? "replacement"
      : old
        ? "correction"
        : "observation",
    reason,
    source: origin,
    supersedesId: old?._id,
  });
  const latest = next
    ? await ctx.db
        .query("vehicleMileageLogs")
        .withIndex("by_agency_vehicle_active_observed", (q) =>
          q
            .eq("agencyId", agencyId)
            .eq("vehicleId", vehicleId)
            .eq("active", true),
        )
        .order("desc")
        .first()
    : await ctx.db.get(id);
  await ctx.db.patch(guard._id, {
    latestMileageId: latest!._id,
    mileageMeters: latest!.meters,
    mileageObservedAt: latest!.observedAt,
    odometerOffset: latest!.offset,
    epochStartedAt: input.replacement ? input.observedAt : guard.epochStartedAt,
    revision: guard.revision + 1,
  });
  await refreshSchedules(ctx, agencyId, vehicleId, actorId);
  await operationAudit(
    ctx,
    agencyId,
    actorId,
    old ? "mileage.corrected" : "mileage.recorded",
    id,
  );
  return id;
}
