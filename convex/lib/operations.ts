import { ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { ownedVehicle, fleetAccess } from "./fleet";
import { writeAudit } from "./auth";
import { hasPermission } from "./permissions";
import { source } from "./operationsValidators";
import {
  fingerprint,
  MAX_ALLOCATION_CANDIDATES,
  MAX_DOCUMENT_TYPES,
  MAX_ISSUES,
  MAX_SCHEDULES,
  overlaps,
  dueState,
  textValue,
} from "../../src/lib/operations";

export type Source = Infer<typeof source>;
type ReadCtx = QueryCtx | MutationCtx;
export const sourceKey = (value: Source) =>
  value.kind === "manual"
    ? `manual:${value.key}`
    : value.kind === "initial"
      ? `initial:${value.vehicleId}`
      : `${value.kind}:${value.id}`;
export const base = (agencyId: Id<"agencies">, actorId: Id<"users">) => ({
  agencyId,
  actorId,
  recordedAt: Date.now(),
  revision: 1,
});
export function revision(record: { revision: number }, expected: number) {
  if (!Number.isSafeInteger(expected) || record.revision !== expected)
    throw new ConvexError("OPERATIONS_CONFLICT");
}
export function fail(code = "OPERATIONS_INVALID"): never {
  throw new ConvexError(code);
}
export async function operationAudit(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  actorId: Id<"users">,
  action: string,
  id: string,
) {
  await writeAudit(ctx, {
    agencyId,
    actorUserId: actorId,
    action: `operations.${action}`,
    targetType: "operations",
    targetId: id,
  });
}
export async function command(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  actorId: Id<"users">,
  operation: string,
  key: string,
  payload: unknown,
  perform: () => Promise<string>,
) {
  if (!/^[\w-]{8,120}$/.test(key)) fail();
  const encoded = fingerprint(payload);
  if (encoded.length > 32_000) fail();
  const receipt = await ctx.db
    .query("commandReceipts")
    .withIndex("by_command", (q) =>
      q
        .eq("agencyId", agencyId)
        .eq("principalKey", actorId)
        .eq("operation", operation)
        .eq("key", key),
    )
    .unique();
  if (receipt) {
    if (receipt.fingerprint !== encoded || receipt.resultRef === undefined)
      fail("REQUEST_KEY_REUSED");
    return receipt.resultRef;
  }
  const result = await perform();
  await ctx.db.insert("commandReceipts", {
    agencyId,
    principalKey: actorId,
    operation,
    key,
    fingerprint: encoded,
    resultRef: result,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 86400000,
  });
  return result;
}
export async function findGuard(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
) {
  return ctx.db
    .query("vehicleAvailabilityStates")
    .withIndex("by_agency_vehicle", (q) =>
      q.eq("agencyId", agencyId).eq("vehicleId", vehicleId),
    )
    .unique();
}
export async function requireGuard(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
) {
  await ownedVehicle(ctx, agencyId, vehicleId);
  const found = await findGuard(ctx, agencyId, vehicleId);
  if (!found) fail("OPERATIONS_MIGRATION_REQUIRED");
  return found;
}
export async function createGuard(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
) {
  const found = await findGuard(ctx, agencyId, vehicleId);
  if (found) return found;
  const id = await ctx.db.insert("vehicleAvailabilityStates", {
    agencyId,
    vehicleId,
    revision: 1,
    readiness: "needs_review",
    verified: false,
    complianceRevision: -1,
    odometerOffset: 0,
    epochStartedAt: 0,
  });
  return (await ctx.db.get(id))!;
}
export async function setIssue(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  actorId: Id<"users">,
  origin: Source,
  reason: string,
  active: boolean,
  severity: "notice" | "blocking" = "blocking",
  resolution = "",
) {
  const key = sourceKey(origin);
  const found = await ctx.db
    .query("vehicleReadinessIssues")
    .withIndex("by_agency_source", (q) =>
      q
        .eq("agencyId", agencyId)
        .eq("vehicleId", vehicleId)
        .eq("sourceKey", key),
    )
    .unique();
  if (!found && !active) return;
  if (active && !found?.active) {
    const issues = await activeIssues(ctx, agencyId, vehicleId);
    if (issues.length >= MAX_ISSUES) fail("OPERATIONS_LIMIT");
  }
  if (found) {
    if (
      found.active === active &&
      found.reason === reason &&
      found.severity === severity
    )
      return found._id;
    await ctx.db.patch(found._id, {
      active,
      reason,
      severity,
      revision: found.revision + 1,
      resolvedAt: active ? undefined : Date.now(),
      resolution: active ? undefined : resolution,
      resolvedBy: active ? undefined : actorId,
    });
    return found._id;
  }
  return ctx.db.insert("vehicleReadinessIssues", {
    ...base(agencyId, actorId),
    vehicleId,
    source: origin,
    sourceKey: key,
    reason,
    active,
    severity,
  });
}
export async function activeIssues(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
) {
  const rows = await ctx.db
    .query("vehicleReadinessIssues")
    .withIndex("by_agency_vehicle_active", (q) =>
      q.eq("agencyId", agencyId).eq("vehicleId", vehicleId).eq("active", true),
    )
    .take(MAX_ISSUES + 1);
  if (rows.length > MAX_ISSUES) fail("OPERATIONS_LIMIT");
  return rows;
}
export async function documentCompliance(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  now = Date.now(),
) {
  const types = await ctx.db
    .query("vehicleDocumentTypes")
    .withIndex("by_agency_active", (q) =>
      q.eq("agencyId", agencyId).eq("active", true),
    )
    .take(MAX_DOCUMENT_TYPES + 1);
  if (types.length > MAX_DOCUMENT_TYPES) fail("OPERATIONS_LIMIT");
  const results = await Promise.all(
    types.map(async (type) => {
      const doc = await ctx.db
        .query("vehicleDocuments")
        .withIndex("by_agency_vehicle_type_status", (q) =>
          q
            .eq("agencyId", agencyId)
            .eq("vehicleId", vehicleId)
            .eq("typeId", type._id)
            .eq("status", "current"),
        )
        .unique();
      const valid =
        !!doc?.fileId &&
        (!type.expiryRequired || doc.expiresAt !== undefined) &&
        (doc.expiresAt === undefined || doc.expiresAt > now);
      return { type, doc, valid };
    }),
  );
  const expiry = results
    .filter((r) => r.type.required && r.doc?.expiresAt !== undefined)
    .map((r) => r.doc!.expiresAt!);
  return { results, until: expiry.length ? Math.min(...expiry) : undefined };
}
export async function refreshReadiness(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  actorId: Id<"users">,
) {
  const guard = await requireGuard(ctx, agencyId, vehicleId);
  const agency = (await ctx.db.get(agencyId))!;
  const compliance = await documentCompliance(ctx, agencyId, vehicleId);
  const required = new Set(
    compliance.results.filter((r) => r.type.required).map((r) => r.type._id),
  );
  for (const row of compliance.results)
    if (row.type.required) {
      await setIssue(
        ctx,
        agencyId,
        vehicleId,
        actorId,
        { kind: "document", id: row.type._id },
        row.type.code,
        !row.valid,
        "blocking",
        "Document verified",
      );
    }
  for (const issue of await activeIssues(ctx, agencyId, vehicleId))
    if (issue.source.kind === "document" && !required.has(issue.source.id)) {
      await setIssue(
        ctx,
        agencyId,
        vehicleId,
        actorId,
        issue.source,
        issue.reason,
        false,
        issue.severity,
        "Requirement removed",
      );
    }
  const issues = await activeIssues(ctx, agencyId, vehicleId);
  const readiness = issues.some((i) => i.severity === "blocking")
    ? "blocked"
    : guard.verified
      ? "ready"
      : "needs_review";
  await ctx.db.patch(guard._id, {
    readiness,
    complianceRevision: agency.complianceRevision ?? 0,
    complianceUntil: compliance.until,
    revision: guard.revision + 1,
  });
  return readiness;
}
export function projectedReadiness(
  guard: Doc<"vehicleAvailabilityStates"> | null,
  complianceRevision: number,
  now = Date.now(),
) {
  if (!guard) return "needs_review" as const;
  if (guard.complianceUntil !== undefined && guard.complianceUntil <= now)
    return "blocked" as const;
  if (guard.complianceRevision !== complianceRevision)
    return "needs_review" as const;
  return guard.readiness;
}
export async function allocate(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  actorId: Id<"users">,
  origin: Source,
  kind: "maintenance" | "inspection" | "manual",
  startAt: number,
  endAt: number,
  reason: string,
) {
  const vehicle = await ownedVehicle(ctx, agencyId, vehicleId);
  const guard = await requireGuard(ctx, agencyId, vehicleId);
  const migrated = await ctx.db
    .query("operationsMigrations")
    .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
    .unique();
  if (!migrated?.complete) fail("OPERATIONS_MIGRATION_REQUIRED");
  if (vehicle.lifecycle !== "active") fail("FLEET_ARCHIVED");
  const branch = await ctx.db.get(vehicle.branchId);
  if (branch?.agencyId !== agencyId || branch.status !== "active")
    fail("FLEET_REFERENCE");
  if (
    !Number.isSafeInteger(startAt) ||
    !Number.isSafeInteger(endAt) ||
    startAt < 0 ||
    endAt <= startAt ||
    endAt - startAt > 366 * 86400000 ||
    endAt < Date.now()
  )
    fail();
  const key = sourceKey(origin);
  const current = await ctx.db
    .query("vehicleAllocations")
    .withIndex("by_agency_source", (q) =>
      q.eq("agencyId", agencyId).eq("sourceKey", key),
    )
    .unique();
  if (current && current.vehicleId !== vehicleId) fail();
  const candidates = await ctx.db
    .query("vehicleAllocations")
    .withIndex("by_agency_vehicle_blocking_end", (q) =>
      q
        .eq("agencyId", agencyId)
        .eq("vehicleId", vehicleId)
        .eq("blocking", true)
        .gt("endAt", startAt),
    )
    .take(MAX_ALLOCATION_CANDIDATES + 1);
  if (candidates.length > MAX_ALLOCATION_CANDIDATES)
    fail("AVAILABILITY_CHECK_LIMIT");
  if (
    candidates.some(
      (row) => row._id !== current?._id && overlaps({ startAt, endAt }, row),
    )
  )
    fail("ALLOCATION_CONFLICT");
  let id = current?._id;
  if (current)
    await ctx.db.patch(current._id, {
      startAt,
      endAt,
      blocking: true,
      branchId: vehicle.branchId,
      reason,
      revision: current.revision + 1,
    });
  else
    id = await ctx.db.insert("vehicleAllocations", {
      ...base(agencyId, actorId),
      vehicleId,
      branchId: vehicle.branchId,
      source: origin,
      sourceKey: key,
      kind,
      startAt,
      endAt,
      blocking: true,
      reason,
    });
  await ctx.db.patch(guard._id, { revision: guard.revision + 1 });
  return id!;
}
export async function releaseAllocation(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  origin: Source,
) {
  const row = await ctx.db
    .query("vehicleAllocations")
    .withIndex("by_agency_source", (q) =>
      q.eq("agencyId", agencyId).eq("sourceKey", sourceKey(origin)),
    )
    .unique();
  if (row) {
    if (row.vehicleId !== vehicleId) fail();
    await ctx.db.patch(row._id, {
      blocking: false,
      revision: row.revision + 1,
    });
  }
  const guard = await requireGuard(ctx, agencyId, vehicleId);
  await ctx.db.patch(guard._id, { revision: guard.revision + 1 });
}
export async function assertNoWork(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
) {
  const guard = await requireGuard(ctx, agencyId, vehicleId);
  const allocations = await ctx.db
    .query("vehicleAllocations")
    .withIndex("by_agency_vehicle_blocking_end", (q) =>
      q
        .eq("agencyId", agencyId)
        .eq("vehicleId", vehicleId)
        .eq("blocking", true)
        .gt("endAt", Date.now()),
    )
    .take(1);
  for (const status of ["planned", "in_progress"] as const) {
    const work = await ctx.db
      .query("maintenanceRecords")
      .withIndex("by_agency_vehicle_status", (q) =>
        q
          .eq("agencyId", agencyId)
          .eq("vehicleId", vehicleId)
          .eq("status", status),
      )
      .take(1);
    if (work.length) fail("VEHICLE_HAS_WORK");
  }
  if (allocations.length) fail("VEHICLE_HAS_WORK");
  await ctx.db.patch(guard._id, {
    revision: guard.revision + 1,
    verified: false,
    readiness: "needs_review",
  });
}
export async function automaticTask(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  actorId: Id<"users">,
  origin: Source,
  title: string,
  needed: boolean,
  dueAt?: number,
) {
  const key = sourceKey(origin);
  const current = await ctx.db
    .query("operationalTasks")
    .withIndex("by_agency_source", (q) =>
      q.eq("agencyId", agencyId).eq("sourceKey", key),
    )
    .unique();
  if (!needed) {
    if (current && current.status !== "done")
      await ctx.db.patch(current._id, {
        status: "done",
        revision: current.revision + 1,
      });
    return;
  }
  if (current) {
    if (
      current.title !== title ||
      current.dueAt !== dueAt ||
      current.status === "done" ||
      current.status === "cancelled"
    )
      await ctx.db.patch(current._id, {
        title,
        dueAt,
        status: current.status === "in_progress" ? "in_progress" : "open",
        revision: current.revision + 1,
      });
  } else
    await ctx.db.insert("operationalTasks", {
      ...base(agencyId, actorId),
      vehicleId,
      title,
      description: "",
      status: "open",
      priority: "high",
      source: origin,
      sourceKey: key,
      automatic: true,
      dueAt,
    });
}
export async function refreshSchedules(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  actorId: Id<"users">,
) {
  const guard = await requireGuard(ctx, agencyId, vehicleId);
  const rows = await ctx.db
    .query("maintenanceSchedules")
    .withIndex("by_agency_vehicle_active", (q) =>
      q.eq("agencyId", agencyId).eq("vehicleId", vehicleId).eq("active", true),
    )
    .take(MAX_SCHEDULES + 1);
  if (rows.length > MAX_SCHEDULES) fail("OPERATIONS_LIMIT");
  for (const row of rows) {
    const baseline = row.mileageId ? await ctx.db.get(row.mileageId) : null;
    const baselineValid =
      row.baselineValid && (!row.mileageId || baseline?.active === true);
    if (row.baselineValid !== baselineValid)
      await ctx.db.patch(row._id, {
        baselineValid,
        revision: row.revision + 1,
      });
    const state = dueState(
      { ...row, baselineValid },
      guard.mileageMeters,
      Date.now(),
    );
    await automaticTask(
      ctx,
      agencyId,
      vehicleId,
      actorId,
      { kind: "schedule", id: row._id },
      row.service,
      state !== "upcoming",
      row.nextDueAt,
    );
  }
}
export async function taskManager(ctx: ReadCtx, agencyId: Id<"agencies">) {
  const current = await fleetAccess(ctx, agencyId, "task.manage");
  return { ...current, canAssign: current.membership.roleKey !== "EMPLOYEE" };
}
export function canReadWorkCost(role: string) {
  return (
    hasPermission(role, "maintenance.manage") ||
    hasPermission(role, "vehicle.cost.read") ||
    hasPermission(role, "finance.read")
  );
}
export function shortReason(value: string) {
  return textValue(value, 500, true);
}
