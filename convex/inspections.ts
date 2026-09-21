import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { fleetAccess, ownedVehicle } from "./lib/fleet";
import { writeMileage } from "./lib/mileage";
import {
  allocate,
  automaticTask,
  base,
  command,
  fail,
  operationAudit,
  refreshReadiness,
  releaseAllocation,
  requireGuard,
  revision,
  setIssue,
  shortReason,
} from "./lib/operations";
import {
  inspectionDoc,
  inspectionFields,
  inspectionItem,
  unit,
} from "./lib/operationsValidators";
import { integer, textValue } from "../src/lib/operations";

const inspectionStatus = inspectionFields.status;
const inspectionType = inspectionFields.type;
const resultInput = v.object({
  code: v.string(),
  result: inspectionItem.fields.result,
  notes: v.string(),
});

async function requireInspection(
  ctx: Parameters<typeof ownedVehicle>[0],
  agencyId: Id<"agencies">,
  id: Id<"vehicleInspections">,
) {
  const record = await ctx.db.get(id);
  if (!record || record.agencyId !== agencyId) fail("INSPECTION_NOT_FOUND");
  return record;
}

export const list = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(inspectionDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId, "inspection.read");
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    return ctx.db
      .query("vehicleInspections")
      .withIndex("by_agency_vehicle_time", (q) =>
        q.eq("agencyId", args.agencyId).eq("vehicleId", args.vehicleId),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
  },
});

export const queue = query({
  args: {
    agencyId: v.id("agencies"),
    status: inspectionStatus,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(inspectionDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId, "inspection.read");
    return ctx.db
      .query("vehicleInspections")
      .withIndex("by_agency_status_time", (q) =>
        q.eq("agencyId", args.agencyId).eq("status", args.status),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
  },
});

export const get = query({
  args: { agencyId: v.id("agencies"), id: v.id("vehicleInspections") },
  returns: v.union(v.null(), inspectionDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId, "inspection.read");
    const record = await ctx.db.get(args.id);
    return record?.agencyId === args.agencyId ? record : null;
  },
});

export const amendment = query({
  args: { agencyId: v.id("agencies"), originalId: v.id("vehicleInspections") },
  returns: v.union(v.null(), inspectionDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId, "inspection.read");
    await requireInspection(ctx, args.agencyId, args.originalId);
    const row = await ctx.db
      .query("vehicleInspections")
      .withIndex("by_amends", (q) => q.eq("amendsId", args.originalId))
      .first();
    return row?.agencyId === args.agencyId ? row : null;
  },
});
export const create = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    templateId: v.id("inspectionTemplates"),
    type: inspectionType,
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    requestKey: v.string(),
  },
  returns: v.id("vehicleInspections"),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "inspection.manage");
    const vehicle = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    if (vehicle.lifecycle !== "active") fail("FLEET_ARCHIVED");
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "inspection.create",
      args.requestKey,
      args,
      async () => {
        const template = await ctx.db.get(args.templateId);
        if (
          !template ||
          template.agencyId !== args.agencyId ||
          !template.active
        )
          fail("INSPECTION_TEMPLATE_UNAVAILABLE");
        if ((args.startAt === undefined) !== (args.endAt === undefined)) fail();
        const id = await ctx.db.insert("vehicleInspections", {
          ...base(args.agencyId, user._id),
          vehicleId: args.vehicleId,
          templateId: template._id,
          templateVersion: template.version,
          templateName: template.name,
          type: args.type,
          status: "draft",
          items: template.items.map((item) => ({
            ...item,
            result: "unchecked" as const,
            notes: "",
          })),
          notes: "",
          fuelPercent: 0,
          startAt: args.startAt,
          endAt: args.endAt,
          acknowledgment: false,
          amendmentReason: "",
        });
        if (args.startAt !== undefined && args.endAt !== undefined)
          await allocate(
            ctx,
            args.agencyId,
            args.vehicleId,
            user._id,
            { kind: "inspection", id },
            "inspection",
            args.startAt,
            args.endAt,
            template.name.en,
          );
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "inspection.created",
          id,
        );
        return id;
      },
    )) as Id<"vehicleInspections">;
  },
});

export const amend = mutation({
  args: {
    agencyId: v.id("agencies"),
    originalId: v.id("vehicleInspections"),
    reason: v.string(),
    requestKey: v.string(),
  },
  returns: v.id("vehicleInspections"),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "inspection.manage");
    const original = await requireInspection(
      ctx,
      args.agencyId,
      args.originalId,
    );
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "inspection.amend",
      args.requestKey,
      args,
      async () => {
        if (original.status !== "completed") fail("INSPECTION_LOCKED");
        const existing = await ctx.db
          .query("vehicleInspections")
          .withIndex("by_amends", (q) => q.eq("amendsId", original._id))
          .first();
        if (existing) fail("INSPECTION_AMENDMENT_EXISTS");
        const id = await ctx.db.insert("vehicleInspections", {
          ...base(args.agencyId, user._id),
          vehicleId: original.vehicleId,
          templateId: original.templateId,
          templateVersion: original.templateVersion,
          templateName: original.templateName,
          type: original.type,
          status: "draft",
          items: original.items,
          notes: original.notes,
          fuelPercent: original.fuelPercent,
          acknowledgment: false,
          amendsId: original._id,
          amendmentReason: shortReason(args.reason),
        });
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "inspection.amendment_created",
          id,
        );
        return id;
      },
    )) as Id<"vehicleInspections">;
  },
});

export const save = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("vehicleInspections"),
    expectedRevision: v.number(),
    items: v.array(resultInput),
    notes: v.string(),
    fuelPercent: v.number(),
    acknowledgment: v.boolean(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "inspection.manage");
    const record = await requireInspection(ctx, args.agencyId, args.id);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "inspection.save",
      args.requestKey,
      args,
      async () => {
        revision(record, args.expectedRevision);
        if (
          record.status !== "draft" ||
          args.items.length !== record.items.length
        )
          fail("INSPECTION_LOCKED");
        const inputs = new Map(args.items.map((item) => [item.code, item]));
        if (inputs.size !== record.items.length) fail();
        const items = record.items.map((item) => {
          const input = inputs.get(item.code);
          if (!input) fail();
          return {
            ...item,
            result: input.result,
            notes: textValue(input.notes, 500),
          };
        });
        await ctx.db.patch(record._id, {
          items,
          notes: textValue(args.notes, 4000),
          fuelPercent: integer(args.fuelPercent, 0, 100),
          acknowledgment: args.acknowledgment,
          revision: record.revision + 1,
        });
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "inspection.saved",
          record._id,
        );
        return record._id;
      },
    );
    return null;
  },
});

export const complete = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("vehicleInspections"),
    expectedRevision: v.number(),
    mileage: v.optional(
      v.object({ value: v.number(), unit, observedAt: v.number() }),
    ),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "inspection.manage");
    const record = await requireInspection(ctx, args.agencyId, args.id);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "inspection.complete",
      args.requestKey,
      args,
      async () => {
        revision(record, args.expectedRevision);
        if (record.status !== "draft") fail("INSPECTION_LOCKED");
        if (
          !record.acknowledgment ||
          record.items.some(
            (item) => item.required && item.result === "unchecked",
          )
        )
          fail("INSPECTION_INCOMPLETE");
        const failed = record.items.filter((item) => item.result === "fail");
        const blocking = failed.some((item) => item.safety);
        let mileageId: Id<"vehicleMileageLogs"> | undefined;
        if (args.mileage)
          mileageId = await writeMileage(
            ctx,
            args.agencyId,
            record.vehicleId,
            user._id,
            {
              ...args.mileage,
              reason: "Inspection",
              expectedRevision: 0,
              replacement: false,
            },
            { kind: "inspection", id: record._id },
          );
        await ctx.db.patch(record._id, {
          status: "completed",
          completedAt: Date.now(),
          mileageId,
          revision: record.revision + 1,
        });
        if (record.amendsId) {
          await setIssue(
            ctx,
            args.agencyId,
            record.vehicleId,
            user._id,
            { kind: "inspection", id: record.amendsId },
            "Inspection amended",
            false,
            "notice",
            record.amendmentReason,
          );
          await automaticTask(
            ctx,
            args.agencyId,
            record.vehicleId,
            user._id,
            { kind: "inspection", id: record.amendsId },
            "Inspection amended",
            false,
          );
        }
        const reason = failed.length
          ? failed.map((item) => item.labels.en).join(", ")
          : "Inspection passed";
        await setIssue(
          ctx,
          args.agencyId,
          record.vehicleId,
          user._id,
          { kind: "inspection", id: record._id },
          reason,
          failed.length > 0,
          blocking ? "blocking" : "notice",
          failed.length ? "" : "Inspection passed",
        );
        await automaticTask(
          ctx,
          args.agencyId,
          record.vehicleId,
          user._id,
          { kind: "inspection", id: record._id },
          reason,
          failed.length > 0,
        );
        const guard = await requireGuard(ctx, args.agencyId, record.vehicleId);
        if (record.type === "initial" && !record.amendsId)
          await ctx.db.patch(guard._id, {
            verified: true,
            revision: guard.revision + 1,
          });
        await releaseAllocation(ctx, args.agencyId, record.vehicleId, {
          kind: "inspection",
          id: record._id,
        });
        await refreshReadiness(ctx, args.agencyId, record.vehicleId, user._id);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "inspection.completed",
          record._id,
        );
        return record._id;
      },
    );
    return null;
  },
});

export const cancel = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("vehicleInspections"),
    expectedRevision: v.number(),
    reason: v.string(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "inspection.manage");
    const record = await requireInspection(ctx, args.agencyId, args.id);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "inspection.cancel",
      args.requestKey,
      args,
      async () => {
        revision(record, args.expectedRevision);
        if (record.status !== "draft") fail("INSPECTION_LOCKED");
        await ctx.db.patch(record._id, {
          status: "cancelled",
          notes: shortReason(args.reason),
          revision: record.revision + 1,
        });
        await releaseAllocation(ctx, args.agencyId, record.vehicleId, {
          kind: "inspection",
          id: record._id,
        });
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "inspection.cancelled",
          record._id,
        );
        return record._id;
      },
    );
    return null;
  },
});
