import { v, ConvexError } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { fleetAccess, ownedVehicle } from "./lib/fleet";
import {
  activeIssues,
  allocate,
  command,
  createGuard,
  fail,
  findGuard,
  operationAudit,
  projectedReadiness,
  refreshReadiness,
  refreshSchedules,
  releaseAllocation,
  requireGuard,
  revision,
  setIssue,
  shortReason,
} from "./lib/operations";
import { allocationDoc, guardDoc, issueDoc } from "./lib/operationsValidators";
import type { Id } from "./_generated/dataModel";

export const migrateAgency = internalMutation({
  args: { agencyId: v.id("agencies") },
  returns: v.object({ complete: v.boolean(), processed: v.number() }),
  handler: async (ctx, { agencyId }) => {
    const agency = await ctx.db.get(agencyId);
    if (!agency) fail();
    let migration = await ctx.db
      .query("operationsMigrations")
      .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
      .unique();
    if (migration?.complete) return { complete: true, processed: 0 };
    if (!migration) {
      const id = await ctx.db.insert("operationsMigrations", {
        agencyId,
        complete: false,
        cursor: null,
      });
      migration = (await ctx.db.get(id))!;
    }
    const page = await ctx.db
      .query("vehicles")
      .withIndex("by_agency_fleet", (q) => q.eq("agencyId", agencyId))
      .paginate({ cursor: migration.cursor, numItems: 50 });
    for (const vehicle of page.page) {
      await createGuard(ctx, agencyId, vehicle._id);
      await refreshReadiness(
        ctx,
        agencyId,
        vehicle._id,
        agency.createdByUserId,
      );
    }
    await ctx.db.patch(migration._id, {
      complete: page.isDone,
      cursor: page.isDone ? null : page.continueCursor,
    });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.operations.migrateAgency, {
        agencyId,
      });
    return { complete: page.isDone, processed: page.page.length };
  },
});
export const migrateAll = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("agencies")
      .withIndex("by_slug")
      .paginate({ cursor, numItems: 25 });
    for (const agency of page.page)
      await ctx.scheduler.runAfter(0, internal.operations.migrateAgency, {
        agencyId: agency._id,
      });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.operations.migrateAll, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
export const summary = query({
  args: { agencyId: v.id("agencies"), vehicleId: v.id("vehicles") },
  returns: v.object({
    guard: v.union(guardDoc, v.null()),
    readiness: v.union(
      v.literal("ready"),
      v.literal("blocked"),
      v.literal("needs_review"),
    ),
    issues: v.array(issueDoc),
  }),
  handler: async (ctx, { agencyId, vehicleId }) => {
    const { agency } = await fleetAccess(ctx, agencyId);
    await ownedVehicle(ctx, agencyId, vehicleId);
    const guard = await findGuard(ctx, agencyId, vehicleId);
    return {
      guard,
      readiness: projectedReadiness(guard, agency.complianceRevision ?? 0),
      issues: await activeIssues(ctx, agencyId, vehicleId),
    };
  },
});
export const allocations = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(allocationDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId);
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    return ctx.db
      .query("vehicleAllocations")
      .withIndex("by_agency_vehicle_blocking_start", (q) =>
        q
          .eq("agencyId", args.agencyId)
          .eq("vehicleId", args.vehicleId)
          .eq("blocking", true),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
  },
});
export const allocationHistory = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    blocking: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(allocationDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId);
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    return ctx.db
      .query("vehicleAllocations")
      .withIndex("by_agency_vehicle_blocking_start", (q) =>
        q
          .eq("agencyId", args.agencyId)
          .eq("vehicleId", args.vehicleId)
          .eq("blocking", args.blocking),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
  },
});
export const issueHistory = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    active: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(issueDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId);
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    return ctx.db
      .query("vehicleReadinessIssues")
      .withIndex("by_agency_vehicle_active", (q) =>
        q
          .eq("agencyId", args.agencyId)
          .eq("vehicleId", args.vehicleId)
          .eq("active", args.active),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
  },
});
export const saveDowntime = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    id: v.optional(v.id("vehicleAllocations")),
    expectedRevision: v.number(),
    startAt: v.number(),
    endAt: v.number(),
    reason: v.string(),
    requestKey: v.string(),
  },
  returns: v.id("vehicleAllocations"),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      "availability.manage",
    );
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "downtime.save",
      args.requestKey,
      args,
      async () => {
        const existing = args.id ? await ctx.db.get(args.id) : null;
        if (
          args.id &&
          (!existing ||
            existing.agencyId !== args.agencyId ||
            existing.vehicleId !== args.vehicleId ||
            existing.source.kind !== "manual")
        )
          fail();
        if (existing) revision(existing, args.expectedRevision);
        const origin = existing?.source ?? {
          kind: "manual" as const,
          key: args.requestKey,
        };
        const id = await allocate(
          ctx,
          args.agencyId,
          args.vehicleId,
          user._id,
          origin,
          "manual",
          args.startAt,
          args.endAt,
          shortReason(args.reason),
        );
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "downtime.saved",
          id,
        );
        return id;
      },
    )) as Id<"vehicleAllocations">;
  },
});
export const releaseDowntime = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("vehicleAllocations"),
    expectedRevision: v.number(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      "availability.manage",
    );
    const row = await ctx.db.get(args.id);
    if (!row || row.agencyId !== args.agencyId || row.source.kind !== "manual")
      fail();
    await command(
      ctx,
      args.agencyId,
      user._id,
      "downtime.release",
      args.requestKey,
      args,
      async () => {
        revision(row, args.expectedRevision);
        await releaseAllocation(ctx, args.agencyId, row.vehicleId, row.source);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "downtime.released",
          row._id,
        );
        return row._id;
      },
    );
    return null;
  },
});
export const manualIssue = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    id: v.optional(v.id("vehicleReadinessIssues")),
    expectedRevision: v.number(),
    reason: v.string(),
    resolve: v.boolean(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      "availability.manage",
    );
    await requireGuard(ctx, args.agencyId, args.vehicleId);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "issue.manual",
      args.requestKey,
      args,
      async () => {
        const row = args.id ? await ctx.db.get(args.id) : null;
        if (
          args.id &&
          (!row ||
            row.agencyId !== args.agencyId ||
            row.vehicleId !== args.vehicleId ||
            row.source.kind !== "manual")
        )
          fail();
        if (row) revision(row, args.expectedRevision);
        else if (args.resolve) fail();
        const origin = row?.source ?? {
          kind: "manual" as const,
          key: args.requestKey,
        };
        const reason = shortReason(args.reason);
        await setIssue(
          ctx,
          args.agencyId,
          args.vehicleId,
          user._id,
          origin,
          row?.reason ?? reason,
          !args.resolve,
          "blocking",
          reason,
        );
        await refreshReadiness(ctx, args.agencyId, args.vehicleId, user._id);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          args.resolve ? "issue.resolved" : "issue.opened",
          row?._id ?? args.vehicleId,
        );
        return args.vehicleId;
      },
    );
    return null;
  },
});
export const refresh = mutation({
  args: { agencyId: v.id("agencies"), vehicleId: v.id("vehicles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      "availability.manage",
    );
    await refreshReadiness(ctx, args.agencyId, args.vehicleId, user._id);
    return null;
  },
});

export const sweep = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("vehicleAvailabilityStates")
      .withIndex("by_agency_vehicle")
      .paginate({ cursor, numItems: 20 });
    for (const guard of page.page) {
      const agency = await ctx.db.get(guard.agencyId);
      if (!agency) continue;
      try {
        await refreshReadiness(
          ctx,
          guard.agencyId,
          guard.vehicleId,
          agency.createdByUserId,
        );
        await refreshSchedules(
          ctx,
          guard.agencyId,
          guard.vehicleId,
          agency.createdByUserId,
        );
      } catch (error) {
        if (error instanceof ConvexError) {
          await ctx.db.patch(guard._id, {
            readiness: "needs_review",
            revision: guard.revision + 1,
          });
        } else throw error;
      }
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.operations.sweep, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
