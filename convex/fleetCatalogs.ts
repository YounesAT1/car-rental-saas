import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  catalogDto,
  catalogFields,
  catalogKind,
  lifecycle,
} from "./lib/fleetValidators";
import { checkRevision, fleetAccess, fleetAudit } from "./lib/fleet";
import { catalogSchema } from "../src/lib/fleet";
import type { Doc } from "./_generated/dataModel";
const dto = (r: Doc<"fleetCatalogs">) => ({
  id: r._id,
  kind: r.kind,
  code: r.code,
  labels: r.labels,
  publicVisible: r.publicVisible,
  lifecycle: r.lifecycle,
  revision: r.revision,
});
export const list = query({
  args: { agencyId: v.id("agencies") },
  returns: v.array(catalogDto),
  handler: async (ctx, { agencyId }) => {
    await fleetAccess(ctx, agencyId);
    return (
      await ctx.db
        .query("fleetCatalogs")
        .withIndex("by_agency_kind_code", (q) => q.eq("agencyId", agencyId))
        .take(200)
    ).map(dto);
  },
});
export const save = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.optional(v.id("fleetCatalogs")),
    kind: catalogKind,
    expectedRevision: v.number(),
    values: v.object(catalogFields),
  },
  returns: v.id("fleetCatalogs"),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "vehicle.update");
    const parsed = catalogSchema.safeParse(args.values);
    if (!parsed.success) throw new ConvexError("INVALID_FLEET");
    const current = args.id ? await ctx.db.get(args.id) : null;
    if (
      args.id &&
      (!current ||
        current.agencyId !== args.agencyId ||
        current.kind !== args.kind)
    )
      throw new ConvexError("CATALOG_NOT_FOUND");
    if (current) checkRevision(current, args.expectedRevision);
    const duplicate = await ctx.db
      .query("fleetCatalogs")
      .withIndex("by_agency_kind_code", (q) =>
        q
          .eq("agencyId", args.agencyId)
          .eq("kind", args.kind)
          .eq("code", parsed.data.code),
      )
      .unique();
    if (duplicate && duplicate._id !== args.id)
      throw new ConvexError("FLEET_DUPLICATE");
    if (!current) {
      const rows = await ctx.db
        .query("fleetCatalogs")
        .withIndex("by_agency_kind_code", (q) =>
          q.eq("agencyId", args.agencyId).eq("kind", args.kind),
        )
        .take(100);
      if (rows.length >= 100) throw new ConvexError("FLEET_LIMIT");
    }
    const id = current
      ? current._id
      : await ctx.db.insert("fleetCatalogs", {
          ...parsed.data,
          agencyId: args.agencyId,
          kind: args.kind,
          lifecycle: "active",
          revision: 1,
        });
    if (current)
      await ctx.db.patch(id, {
        ...parsed.data,
        revision: current.revision + 1,
      });
    await fleetAudit(
      ctx,
      args.agencyId,
      user._id,
      current ? "catalog.updated" : "catalog.created",
      id,
    );
    return id;
  },
});
export const setStatus = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("fleetCatalogs"),
    expectedRevision: v.number(),
    lifecycle,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "vehicle.update");
    const record = await ctx.db.get(args.id);
    if (!record || record.agencyId !== args.agencyId)
      throw new ConvexError("CATALOG_NOT_FOUND");
    checkRevision(record, args.expectedRevision);
    await ctx.db.patch(record._id, {
      lifecycle: args.lifecycle,
      revision: record.revision + 1,
    });
    await fleetAudit(
      ctx,
      args.agencyId,
      user._id,
      `catalog.${args.lifecycle}`,
      record._id,
    );
    return null;
  },
});
