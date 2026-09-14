import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  addDays,
  costTotal,
  MAX_METERS,
  MAX_SCHEDULES,
  textValue,
} from "../../src/lib/operations";
import { costLine } from "./operationsValidators";
import {
  automaticTask,
  base,
  fail,
  operationAudit,
  refreshSchedules,
  requireGuard,
} from "./operations";

type ReadCtx = QueryCtx | MutationCtx;
export type CostLine = Infer<typeof costLine>;

export function cleanCostLines(lines: CostLine[]) {
  if (lines.length > 100) fail("OPERATIONS_LIMIT");
  const clean = lines.map((line) => ({
    kind: line.kind,
    description: textValue(line.description, 200, true),
    amountMinor: line.amountMinor,
  }));
  costTotal(clean);
  return clean;
}

export async function requireMaintenance(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
  id: Id<"maintenanceRecords">,
) {
  const record = await ctx.db.get(id);
  if (!record || record.agencyId !== agencyId) fail("MAINTENANCE_NOT_FOUND");
  return record;
}

export async function requireVendor(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
  id: Id<"maintenanceVendors"> | undefined,
) {
  if (!id) return undefined;
  const vendor = await ctx.db.get(id);
  if (!vendor || vendor.agencyId !== agencyId || !vendor.active)
    fail("MAINTENANCE_VENDOR_UNAVAILABLE");
  return vendor;
}

export async function requireSchedules(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  ids: Id<"maintenanceSchedules">[],
) {
  if (ids.length > MAX_SCHEDULES || new Set(ids).size !== ids.length)
    fail("OPERATIONS_LIMIT");
  const schedules = await Promise.all(ids.map((id) => ctx.db.get(id)));
  if (
    schedules.some(
      (schedule) =>
        !schedule ||
        schedule.agencyId !== agencyId ||
        schedule.vehicleId !== vehicleId ||
        !schedule.active,
    )
  )
    fail("MAINTENANCE_SCHEDULE_UNAVAILABLE");
  return schedules.map((schedule) => schedule!);
}

export async function completeSchedules(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  actorId: Id<"users">,
  recordId: Id<"maintenanceRecords">,
  scheduleIds: Id<"maintenanceSchedules">[],
  completedAt: number,
) {
  const schedules = await requireSchedules(
    ctx,
    agencyId,
    vehicleId,
    scheduleIds,
  );
  const guard = await requireGuard(ctx, agencyId, vehicleId);
  for (const schedule of schedules) {
    const nextDueAt =
      schedule.days === undefined
        ? undefined
        : addDays(completedAt, schedule.days, schedule.timezone);
    const nextDueMeters =
      schedule.meters === undefined || guard.mileageMeters === undefined
        ? undefined
        : guard.mileageMeters + schedule.meters;
    if (nextDueMeters !== undefined && nextDueMeters > MAX_METERS)
      fail("MILEAGE_INVALID");
    const baselineValid =
      schedule.meters === undefined || guard.latestMileageId !== undefined;
    await ctx.db.patch(schedule._id, {
      baselineAt: completedAt,
      baselineMeters: guard.mileageMeters,
      mileageId: guard.latestMileageId,
      baselineValid,
      nextDueAt,
      nextDueMeters,
      lastRecordId: recordId,
      revision: schedule.revision + 1,
    });
    await automaticTask(
      ctx,
      agencyId,
      vehicleId,
      actorId,
      { kind: "schedule", id: schedule._id },
      schedule.service,
      !baselineValid,
      nextDueAt,
    );
  }
  await refreshSchedules(ctx, agencyId, vehicleId, actorId);
}

export async function postExpense(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  actorId: Id<"users">,
  maintenanceId: Id<"maintenanceRecords">,
  sourceKey: string,
  amountMinor: number,
  currency: string,
  description: string,
  incurredAt: number,
  reversesId?: Id<"expenses">,
) {
  if (
    !Number.isSafeInteger(amountMinor) ||
    Math.abs(amountMinor) > 1_000_000_000_000
  )
    fail();
  const existing = await ctx.db
    .query("expenses")
    .withIndex("by_agency_source", (q) =>
      q.eq("agencyId", agencyId).eq("sourceKey", sourceKey),
    )
    .unique();
  if (existing) return existing._id;
  const id = await ctx.db.insert("expenses", {
    ...base(agencyId, actorId),
    vehicleId,
    maintenanceId,
    sourceKey,
    amountMinor,
    currency,
    description: textValue(description, 500, true),
    incurredAt,
    reversesId,
  });
  await operationAudit(ctx, agencyId, actorId, "expense.posted", id);
  return id;
}
