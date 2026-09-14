import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { requireAgencyMembership, requirePermission, writeAudit } from "./auth";
import { hasPermission, type PermissionId } from "./permissions";
import { findGuard, projectedReadiness } from "./operations";
export async function fleetAccess(
  ctx: QueryCtx | MutationCtx,
  agencyId: Id<"agencies">,
  permission: PermissionId = "vehicle.read",
) {
  const current = await requireAgencyMembership(ctx, agencyId);
  requirePermission(current.membership, permission);
  return current;
}
export async function ownedVehicle(
  ctx: QueryCtx | MutationCtx,
  agencyId: Id<"agencies">,
  id: Id<"vehicles">,
) {
  const vehicle = await ctx.db.get(id);
  if (!vehicle || vehicle.agencyId !== agencyId)
    throw new ConvexError("VEHICLE_NOT_FOUND");
  return vehicle;
}
export function checkRevision(record: { revision: number }, revision: number) {
  if (!Number.isSafeInteger(revision) || record.revision !== revision)
    throw new ConvexError("FLEET_CONFLICT");
}
export async function vehicleProjection(
  ctx: QueryCtx | MutationCtx,
  record: Doc<"vehicles">,
  role: string,
) {
  const branch = await ctx.db.get(record.branchId);
  const category = await ctx.db.get(record.categoryId);
  const guard = await findGuard(ctx, record.agencyId, record._id);
  const agency = await ctx.db.get(record.agencyId);
  return {
    id: record._id,
    mileageMeters: guard?.mileageMeters ?? null,
    readiness: projectedReadiness(guard, agency?.complianceRevision ?? 0),
    fleetNumber: record.fleetNumber,
    plate: record.plate,
    vin: record.vin,
    make: record.make,
    model: record.model,
    trim: record.trim,
    year: record.year,
    color: record.color,
    transmission: record.transmission,
    fuel: record.fuel,
    seats: record.seats,
    doors: record.doors,
    branchId: record.branchId,
    categoryId: record.categoryId,
    featureIds: record.featureIds,
    description: record.description,
    notes: record.notes,
    lifecycle: record.lifecycle,
    publicVisible: record.publicVisible,
    revision: record.revision,
    updatedAt: record.updatedAt,
    branchName: branch?.name ?? "",
    categoryLabels: category?.labels ?? { en: "", fr: "", ar: "" },
    acquisitionCost: hasPermission(role, "vehicle.cost.read")
      ? (record.acquisitionCost ?? null)
      : null,
  };
}
export async function usage(ctx: MutationCtx, agencyId: Id<"agencies">) {
  const found = await ctx.db
    .query("fleetUsage")
    .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
    .unique();
  if (found) return found;
  const id = await ctx.db.insert("fleetUsage", {
    agencyId,
    vehicles: 0,
    bytes: 0,
    reservedBytes: 0,
  });
  return (await ctx.db.get(id))!;
}
export async function fleetAudit(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  actorUserId: Id<"users">,
  action: string,
  targetId: string,
) {
  await writeAudit(ctx, {
    agencyId,
    actorUserId,
    action: `fleet.${action}`,
    targetType: "fleet",
    targetId,
  });
}
