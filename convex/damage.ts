import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fleetAccess, ownedVehicle } from "./lib/fleet";
import {
  automaticTask,
  base,
  canReadWorkCost,
  command,
  fail,
  operationAudit,
  refreshReadiness,
  revision,
  setIssue,
  shortReason,
} from "./lib/operations";
import {
  damageFields,
  damageStatus,
  documentValidator,
  severity,
} from "./lib/operationsValidators";
import {
  damageTransitionAllowed,
  integer,
  textValue,
} from "../src/lib/operations";

const responsibility = damageFields.responsibility;
const damageView = documentValidator("damageReports", {
  ...damageFields,
  estimateMinor: v.union(v.number(), v.null()),
});

function projectDamage(record: Doc<"damageReports">, canReadCost: boolean) {
  return {
    ...record,
    estimateMinor: canReadCost ? (record.estimateMinor ?? null) : null,
  };
}

async function requireDamage(
  ctx: Parameters<typeof ownedVehicle>[0],
  agencyId: Id<"agencies">,
  id: Id<"damageReports">,
) {
  const record = await ctx.db.get(id);
  if (!record || record.agencyId !== agencyId) fail("DAMAGE_NOT_FOUND");
  return record;
}

async function syncDamageEffects(
  ctx: Parameters<typeof setIssue>[0],
  record: Doc<"damageReports">,
  actorId: Id<"users">,
  active: boolean,
  resolution = "",
) {
  const reason = `${record.location}: ${record.description}`;
  await setIssue(
    ctx,
    record.agencyId,
    record.vehicleId,
    actorId,
    { kind: "damage", id: record._id },
    reason,
    active && record.severity === "blocking",
    "blocking",
    resolution,
  );
  await automaticTask(
    ctx,
    record.agencyId,
    record.vehicleId,
    actorId,
    { kind: "damage", id: record._id },
    `Damage: ${record.location}`,
    active,
  );
  await refreshReadiness(ctx, record.agencyId, record.vehicleId, actorId);
}

export const list = query({
  args: {
    agencyId: v.id("agencies"),
    status: damageStatus,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(damageView),
  handler: async (ctx, args) => {
    const { membership } = await fleetAccess(ctx, args.agencyId, "damage.read");
    const page = await ctx.db
      .query("damageReports")
      .withIndex("by_agency_status_time", (q) =>
        q.eq("agencyId", args.agencyId).eq("status", args.status),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
    const canReadCost = canReadWorkCost(membership.roleKey);
    return {
      ...page,
      page: page.page.map((record) => projectDamage(record, canReadCost)),
    };
  },
});

export const history = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(damageView),
  handler: async (ctx, args) => {
    const { membership } = await fleetAccess(ctx, args.agencyId, "damage.read");
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    const page = await ctx.db
      .query("damageReports")
      .withIndex("by_agency_vehicle_time", (q) =>
        q.eq("agencyId", args.agencyId).eq("vehicleId", args.vehicleId),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
    const canReadCost = canReadWorkCost(membership.roleKey);
    return {
      ...page,
      page: page.page.map((record) => projectDamage(record, canReadCost)),
    };
  },
});

export const get = query({
  args: { agencyId: v.id("agencies"), id: v.id("damageReports") },
  returns: v.union(v.null(), damageView),
  handler: async (ctx, args) => {
    const { membership } = await fleetAccess(ctx, args.agencyId, "damage.read");
    const record = await ctx.db.get(args.id);
    return record?.agencyId === args.agencyId
      ? projectDamage(record, canReadWorkCost(membership.roleKey))
      : null;
  },
});

export const report = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    inspectionId: v.id("vehicleInspections"),
    location: v.string(),
    description: v.string(),
    severity,
    responsibility,
    disputed: v.boolean(),
    estimateMinor: v.optional(v.number()),
    expectedCurrency: v.string(),
    requestKey: v.string(),
  },
  returns: v.id("damageReports"),
  handler: async (ctx, args) => {
    const { user, agency } = await fleetAccess(
      ctx,
      args.agencyId,
      "damage.manage",
    );
    const vehicle = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    if (vehicle.lifecycle !== "active") fail("FLEET_ARCHIVED");
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "damage.report",
      args.requestKey,
      args,
      async () => {
        const inspection = await ctx.db.get(args.inspectionId);
        if (
          !inspection ||
          inspection.agencyId !== args.agencyId ||
          inspection.vehicleId !== args.vehicleId ||
          inspection.status !== "completed"
        )
          fail("DAMAGE_INSPECTION_REQUIRED");
        if (args.expectedCurrency !== agency.currency)
          fail("OPERATIONS_CONFLICT");
        const id = await ctx.db.insert("damageReports", {
          ...base(args.agencyId, user._id),
          vehicleId: args.vehicleId,
          inspectionId: inspection._id,
          location: textValue(args.location, 160, true),
          description: textValue(args.description, 2000, true),
          severity: args.severity,
          status: "reported",
          responsibility: args.responsibility,
          disputed: args.disputed,
          resolution: "",
          estimateMinor:
            args.estimateMinor === undefined
              ? undefined
              : integer(args.estimateMinor, 0, 1_000_000_000_000),
          currency: agency.currency,
        });
        const record = (await ctx.db.get(id))!;
        await syncDamageEffects(ctx, record, user._id, true);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "damage.reported",
          id,
        );
        return id;
      },
    )) as Id<"damageReports">;
  },
});

export const update = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("damageReports"),
    expectedRevision: v.number(),
    location: v.string(),
    description: v.string(),
    severity,
    responsibility,
    disputed: v.boolean(),
    estimateMinor: v.optional(v.number()),
    expectedCurrency: v.string(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "damage.manage");
    const record = await requireDamage(ctx, args.agencyId, args.id);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "damage.update",
      args.requestKey,
      args,
      async () => {
        revision(record, args.expectedRevision);
        if (record.status === "resolved") fail("DAMAGE_LOCKED");
        if (args.expectedCurrency !== record.currency)
          fail("OPERATIONS_CONFLICT");
        await ctx.db.patch(record._id, {
          location: textValue(args.location, 160, true),
          description: textValue(args.description, 2000, true),
          severity: args.severity,
          responsibility: args.responsibility,
          disputed: args.disputed,
          estimateMinor:
            args.estimateMinor === undefined
              ? undefined
              : integer(args.estimateMinor, 0, 1_000_000_000_000),
          revision: record.revision + 1,
        });
        const updated = (await ctx.db.get(record._id))!;
        await syncDamageEffects(ctx, updated, user._id, true);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "damage.updated",
          record._id,
        );
        return record._id;
      },
    );
    return null;
  },
});

export const transition = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("damageReports"),
    expectedRevision: v.number(),
    status: damageStatus,
    resolution: v.string(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "damage.manage");
    const record = await requireDamage(ctx, args.agencyId, args.id);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "damage.transition",
      args.requestKey,
      args,
      async () => {
        revision(record, args.expectedRevision);
        if (!damageTransitionAllowed(record.status, args.status))
          fail("DAMAGE_TRANSITION");
        const resolution =
          args.status === "resolved" ? shortReason(args.resolution) : "";
        if (args.status === "resolved") {
          const evidence = await ctx.db
            .query("files")
            .withIndex("by_agency_owner", (q) =>
              q
                .eq("agencyId", args.agencyId)
                .eq("ownerKey", `damage:${record._id}`),
            )
            .take(1);
          if (evidence.length === 0) fail("DAMAGE_EVIDENCE_REQUIRED");
        }
        await ctx.db.patch(record._id, {
          status: args.status,
          resolution,
          resolvedAt: args.status === "resolved" ? Date.now() : undefined,
          revision: record.revision + 1,
        });
        const updated = (await ctx.db.get(record._id))!;
        await syncDamageEffects(
          ctx,
          updated,
          user._id,
          args.status !== "resolved",
          resolution,
        );
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          `damage.${args.status}`,
          record._id,
        );
        return record._id;
      },
    );
    return null;
  },
});
