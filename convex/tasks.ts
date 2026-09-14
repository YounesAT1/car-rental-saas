import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { mutation, query } from "./_generated/server";
import { fleetAccess, ownedVehicle } from "./lib/fleet";
import {
  base,
  command,
  fail,
  operationAudit,
  revision,
  taskManager,
} from "./lib/operations";
import { taskDoc, taskStatus } from "./lib/operationsValidators";
import { textValue } from "../src/lib/operations";
import type { Id } from "./_generated/dataModel";
export const list = query({
  args: {
    agencyId: v.id("agencies"),
    status: taskStatus,
    mine: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(taskDoc),
  handler: async (ctx, args) => {
    const { user, membership } = await fleetAccess(
      ctx,
      args.agencyId,
      "task.read",
    );
    const mine = args.mine || membership.roleKey === "EMPLOYEE";
    const rows = ctx.db.query("operationalTasks");
    return (
      mine
        ? rows.withIndex("by_agency_assignee_status", (q) =>
            q
              .eq("agencyId", args.agencyId)
              .eq("assigneeId", user._id)
              .eq("status", args.status),
          )
        : rows.withIndex("by_agency_status_due", (q) =>
            q.eq("agencyId", args.agencyId).eq("status", args.status),
          )
    ).paginate({
      ...args.paginationOpts,
      numItems: Math.min(25, args.paginationOpts.numItems),
    });
  },
});
export const assignees = query({
  args: { agencyId: v.id("agencies") },
  returns: v.array(v.object({ id: v.id("users"), name: v.string() })),
  handler: async (ctx, { agencyId }) => {
    const { canAssign } = await taskManager(ctx, agencyId);
    if (!canAssign) fail("PERMISSION_DENIED");
    const members = await ctx.db
      .query("agencyMembers")
      .withIndex("by_agency_status", (q) =>
        q.eq("agencyId", agencyId).eq("status", "active"),
      )
      .take(201);
    if (members.length > 200) fail("OPERATIONS_LIMIT");
    const users = await Promise.all(members.map((r) => ctx.db.get(r.userId)));
    return users
      .filter((r) => r?.status === "active")
      .map((r) => ({ id: r!._id, name: r!.name ?? "—" }));
  },
});
export const save = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.optional(v.id("operationalTasks")),
    expectedRevision: v.number(),
    vehicleId: v.optional(v.id("vehicles")),
    title: v.string(),
    description: v.string(),
    assigneeId: v.optional(v.id("users")),
    dueAt: v.optional(v.number()),
    status: taskStatus,
    priority: v.union(
      v.literal("normal"),
      v.literal("high"),
      v.literal("urgent"),
    ),
    requestKey: v.string(),
  },
  returns: v.id("operationalTasks"),
  handler: async (ctx, args) => {
    const { user, canAssign } = await taskManager(ctx, args.agencyId);
    const current = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (!current || current.agencyId !== args.agencyId)) fail();
    if (!canAssign && (!current || current.assigneeId !== user._id))
      fail("PERMISSION_DENIED");
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "task.save",
      args.requestKey,
      args,
      async () => {
        if (current) revision(current, args.expectedRevision);
        if (
          !canAssign &&
          (args.title !== current!.title ||
            args.assigneeId !== current!.assigneeId ||
            args.vehicleId !== current!.vehicleId ||
            args.dueAt !== current!.dueAt ||
            args.priority !== current!.priority)
        )
          fail("PERMISSION_DENIED");
        if (args.vehicleId)
          await ownedVehicle(ctx, args.agencyId, args.vehicleId);
        if (args.assigneeId) {
          const member = await ctx.db
            .query("agencyMembers")
            .withIndex("by_agency_user", (q) =>
              q.eq("agencyId", args.agencyId).eq("userId", args.assigneeId!),
            )
            .unique();
          const person = await ctx.db.get(args.assigneeId);
          if (member?.status !== "active" || person?.status !== "active")
            fail("ASSIGNEE_UNAVAILABLE");
        }
        if (
          args.dueAt !== undefined &&
          (!Number.isSafeInteger(args.dueAt) || args.dueAt < 0)
        )
          fail();
        if (
          current?.automatic &&
          (args.vehicleId !== current.vehicleId || args.title !== current.title)
        )
          fail();
        const values = {
          vehicleId: args.vehicleId,
          title: textValue(args.title, 160, true),
          description: textValue(args.description, 2000),
          assigneeId: args.assigneeId,
          dueAt: args.dueAt,
          status: args.status,
          priority: args.priority,
        };
        let id = current?._id;
        if (current)
          await ctx.db.patch(current._id, {
            ...values,
            revision: current.revision + 1,
          });
        else
          id = await ctx.db.insert("operationalTasks", {
            ...base(args.agencyId, user._id),
            ...values,
            source: { kind: "manual", key: args.requestKey },
            sourceKey: `manual:${args.requestKey}`,
            automatic: false,
          });
        await operationAudit(ctx, args.agencyId, user._id, "task.saved", id!);
        return id!;
      },
    )) as Id<"operationalTasks">;
  },
});
