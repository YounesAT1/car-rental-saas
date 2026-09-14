import { ConvexError, v } from "convex/values";
import { createGuard, assertNoWork, refreshReadiness } from "./lib/operations";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  vehicleDto,
  vehicleFields,
  lifecycle,
  labels,
} from "./lib/fleetValidators";
import {
  checkRevision,
  fleetAccess,
  fleetAudit,
  ownedVehicle,
  usage,
  vehicleProjection,
} from "./lib/fleet";
import { fleetSchema, normalizeIdentifier } from "../src/lib/fleet";

async function validate(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  values: Omit<
    Doc<"vehicles">,
    | "_id"
    | "_creationTime"
    | "agencyId"
    | "lifecycle"
    | "fleetNormalized"
    | "plateNormalized"
    | "vinNormalized"
    | "publicVisible"
    | "revision"
    | "updatedAt"
    | "searchText"
    | "acquisitionCost"
  >,
  current?: Doc<"vehicles">,
) {
  const parsed = fleetSchema().safeParse(values);
  if (!parsed.success) throw new ConvexError("INVALID_FLEET");
  const branch = await ctx.db.get(values.branchId);
  if (
    !branch ||
    branch.agencyId !== agencyId ||
    (branch.status !== "active" && current?.branchId !== branch._id)
  )
    throw new ConvexError("FLEET_REFERENCE");
  for (const [id, kind] of [
    [values.categoryId, "category"],
    ...values.featureIds.map((id) => [id, "feature"] as const),
  ] as const) {
    const ref = await ctx.db.get(id);
    const retained =
      kind === "category"
        ? current?.categoryId === id
        : current?.featureIds.includes(id);
    if (
      !ref ||
      ref.agencyId !== agencyId ||
      ref.kind !== kind ||
      (ref.lifecycle !== "active" && !retained)
    )
      throw new ConvexError("FLEET_REFERENCE");
  }
  const fleetNormalized = normalizeIdentifier(values.fleetNumber);
  const plateNormalized = normalizeIdentifier(values.plate);
  const vinNormalized = normalizeIdentifier(values.vin);
  for (const [index, field, value] of [
    ["by_agency_fleet", "fleetNormalized", fleetNormalized],
    ["by_agency_plate", "plateNormalized", plateNormalized],
    ["by_agency_vin", "vinNormalized", vinNormalized],
  ] as const) {
    if (!value) continue;
    const found = await ctx.db
      .query("vehicles")
      .withIndex(index, (q) => q.eq("agencyId", agencyId).eq(field, value))
      .unique();
    if (found && found._id !== current?._id)
      throw new ConvexError("FLEET_DUPLICATE");
  }
  return {
    ...parsed.data,
    branchId: values.branchId,
    categoryId: values.categoryId,
    featureIds: values.featureIds,
    fleetNormalized,
    plateNormalized,
    vinNormalized,
    searchText: [
      parsed.data.make,
      parsed.data.model,
      parsed.data.trim,
      parsed.data.fleetNumber,
      parsed.data.plate,
    ].join(" "),
  };
}
export const options = query({
  args: { agencyId: v.id("agencies") },
  returns: v.array(
    v.object({
      id: v.id("branches"),
      name: v.string(),
      status: v.union(v.literal("active"), v.literal("archived")),
    }),
  ),
  handler: async (ctx, { agencyId }) => {
    await fleetAccess(ctx, agencyId);
    return (
      await ctx.db
        .query("branches")
        .withIndex("by_agency_code", (q) => q.eq("agencyId", agencyId))
        .take(100)
    ).map((r) => ({ id: r._id, name: r.name, status: r.status }));
  },
});
export const list = query({
  args: {
    agencyId: v.id("agencies"),
    lifecycle,
    branchId: v.optional(v.id("branches")),
    categoryId: v.optional(v.id("fleetCatalogs")),
    search: v.string(),
    exact: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vehicleDto),
  handler: async (ctx, args) => {
    const { membership } = await fleetAccess(ctx, args.agencyId);
    if (args.search.length > 100) throw new ConvexError("INVALID_FLEET");
    const { agencyId, branchId, categoryId } = args;
    const term = args.search.trim();
    if (args.exact && term) {
      const normalized = normalizeIdentifier(term);
      if (!normalized) return { page: [], isDone: true, continueCursor: "" };
      const records = await Promise.all([
        ctx.db
          .query("vehicles")
          .withIndex("by_agency_fleet", (q) =>
            q.eq("agencyId", agencyId).eq("fleetNormalized", normalized),
          )
          .unique(),
        ctx.db
          .query("vehicles")
          .withIndex("by_agency_plate", (q) =>
            q.eq("agencyId", agencyId).eq("plateNormalized", normalized),
          )
          .unique(),
        ctx.db
          .query("vehicles")
          .withIndex("by_agency_vin", (q) =>
            q.eq("agencyId", agencyId).eq("vinNormalized", normalized),
          )
          .unique(),
      ]);
      const unique = [
        ...new Map(
          records
            .filter(
              (r) =>
                r &&
                r.lifecycle === args.lifecycle &&
                (!branchId || r.branchId === branchId) &&
                (!categoryId || r.categoryId === categoryId),
            )
            .map((r) => [r!._id, r!]),
        ).values(),
      ];
      return {
        page: await Promise.all(
          unique.map((r) => vehicleProjection(ctx, r, membership.roleKey)),
        ),
        isDone: true,
        continueCursor: "",
      };
    }
    const base = ctx.db.query("vehicles");
    const query = term
      ? base.withSearchIndex("search_fleet", (q) => {
          let search = q
            .search("searchText", term)
            .eq("agencyId", agencyId)
            .eq("lifecycle", args.lifecycle);
          if (branchId) search = search.eq("branchId", branchId);
          if (categoryId) search = search.eq("categoryId", categoryId);
          return search;
        })
      : branchId && categoryId
        ? base
            .withIndex("by_agency_branch_category", (q) =>
              q
                .eq("agencyId", agencyId)
                .eq("branchId", branchId)
                .eq("categoryId", categoryId)
                .eq("lifecycle", args.lifecycle),
            )
            .order("desc")
        : branchId
          ? base
              .withIndex("by_agency_branch", (q) =>
                q
                  .eq("agencyId", agencyId)
                  .eq("branchId", branchId)
                  .eq("lifecycle", args.lifecycle),
              )
              .order("desc")
          : categoryId
            ? base
                .withIndex("by_agency_category", (q) =>
                  q
                    .eq("agencyId", agencyId)
                    .eq("categoryId", categoryId)
                    .eq("lifecycle", args.lifecycle),
                )
                .order("desc")
            : base
                .withIndex("by_agency_lifecycle", (q) =>
                  q.eq("agencyId", agencyId).eq("lifecycle", args.lifecycle),
                )
                .order("desc");
    const page = await query.paginate({
      ...args.paginationOpts,
      numItems: Math.min(25, args.paginationOpts.numItems),
    });
    return {
      ...page,
      page: await Promise.all(
        page.page.map((r) => vehicleProjection(ctx, r, membership.roleKey)),
      ),
    };
  },
});
export const get = query({
  args: { agencyId: v.id("agencies"), vehicleId: v.id("vehicles") },
  returns: v.union(v.null(), vehicleDto),
  handler: async (ctx, { agencyId, vehicleId }) => {
    const { membership } = await fleetAccess(ctx, agencyId);
    const record = await ctx.db.get(vehicleId);
    if (!record || record.agencyId !== agencyId) return null;
    return vehicleProjection(ctx, record, membership.roleKey);
  },
});
export const save = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.optional(v.id("vehicles")),
    expectedRevision: v.number(),
    values: v.object(vehicleFields),
  },
  returns: v.id("vehicles"),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      args.vehicleId ? "vehicle.update" : "vehicle.create",
    );
    const current = args.vehicleId
      ? await ownedVehicle(ctx, args.agencyId, args.vehicleId)
      : undefined;
    if (current) {
      checkRevision(current, args.expectedRevision);
      if (current.lifecycle !== "active")
        throw new ConvexError("FLEET_ARCHIVED");
    }
    const values = await validate(ctx, args.agencyId, args.values, current);
    if (current && current.branchId !== values.branchId)
      await assertNoWork(ctx, args.agencyId, current._id);
    let id = current?._id;
    if (current)
      await ctx.db.patch(current._id, {
        ...values,
        revision: current.revision + 1,
        updatedAt: Date.now(),
      });
    else {
      const counter = await usage(ctx, args.agencyId);
      if (counter.vehicles >= 1000) throw new ConvexError("FLEET_LIMIT");
      id = await ctx.db.insert("vehicles", {
        ...values,
        agencyId: args.agencyId,
        lifecycle: "active",
        publicVisible: false,
        revision: 1,
        updatedAt: Date.now(),
      });
      await ctx.db.patch(counter._id, { vehicles: counter.vehicles + 1 });
      await createGuard(ctx, args.agencyId, id);
      if (counter.vehicles === 0) {
        const migrated = await ctx.db
          .query("operationsMigrations")
          .withIndex("by_agency", (q) => q.eq("agencyId", args.agencyId))
          .unique();
        if (!migrated)
          await ctx.db.insert("operationsMigrations", {
            agencyId: args.agencyId,
            complete: true,
            cursor: null,
          });
      }
      await refreshReadiness(ctx, args.agencyId, id, user._id);
    }
    await fleetAudit(
      ctx,
      args.agencyId,
      user._id,
      current ? "vehicle.updated" : "vehicle.created",
      id!,
    );
    return id!;
  },
});
export const setStatus = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    expectedRevision: v.number(),
    lifecycle,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "vehicle.archive");
    const record = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    checkRevision(record, args.expectedRevision);
    if (args.lifecycle === "active") {
      const branch = await ctx.db.get(record.branchId);
      const category = await ctx.db.get(record.categoryId);
      if (branch?.status !== "active" || category?.lifecycle !== "active")
        throw new ConvexError("FLEET_REFERENCE");
    }
    await assertNoWork(ctx, args.agencyId, record._id);
    await ctx.db.patch(record._id, {
      lifecycle: args.lifecycle,
      publicVisible: false,
      revision: record.revision + 1,
      updatedAt: Date.now(),
    });
    await fleetAudit(
      ctx,
      args.agencyId,
      user._id,
      `vehicle.${args.lifecycle}`,
      record._id,
    );
    return null;
  },
});
export const setVisibility = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    expectedRevision: v.number(),
    publicVisible: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "vehicle.publish");
    const record = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    checkRevision(record, args.expectedRevision);
    if (record.lifecycle !== "active") throw new ConvexError("FLEET_ARCHIVED");
    await ctx.db.patch(record._id, {
      publicVisible: args.publicVisible,
      revision: record.revision + 1,
      updatedAt: Date.now(),
    });
    await fleetAudit(
      ctx,
      args.agencyId,
      user._id,
      args.publicVisible ? "vehicle.published" : "vehicle.hidden",
      record._id,
    );
    return null;
  },
});
export const setCost = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    expectedRevision: v.number(),
    amountMinor: v.union(v.number(), v.null()),
    expectedCurrency: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, agency } = await fleetAccess(
      ctx,
      args.agencyId,
      "agency.settings",
    );
    if (args.expectedCurrency !== agency.currency)
      throw new ConvexError("FLEET_CONFLICT");
    const record = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    checkRevision(record, args.expectedRevision);
    if (record.lifecycle !== "active") throw new ConvexError("FLEET_ARCHIVED");
    if (
      args.amountMinor !== null &&
      (!Number.isSafeInteger(args.amountMinor) ||
        args.amountMinor < 0 ||
        args.amountMinor > 1e12)
    )
      throw new ConvexError("INVALID_FLEET");
    await ctx.db.patch(record._id, {
      acquisitionCost:
        args.amountMinor === null
          ? undefined
          : { amountMinor: args.amountMinor, currency: agency.currency },
      revision: record.revision + 1,
      updatedAt: Date.now(),
    });
    await fleetAudit(
      ctx,
      args.agencyId,
      user._id,
      "vehicle.costUpdated",
      record._id,
    );
    return null;
  },
});
// Deliberately public-safe projection for future catalog consumers; no private identifiers.
export const publicVehicle = query({
  args: { agencyId: v.id("agencies"), vehicleId: v.id("vehicles") },
  returns: v.union(
    v.null(),
    v.object({
      make: v.string(),
      model: v.string(),
      trim: v.string(),
      year: v.number(),
      color: v.string(),
      transmission: vehicleFields.transmission,
      fuel: vehicleFields.fuel,
      seats: v.number(),
      doors: v.number(),
      description: v.string(),
      category: labels,
      features: v.array(labels),
      photos: v.array(v.object({ url: v.string(), alt: labels })),
    }),
  ),
  handler: async (ctx, { agencyId, vehicleId }) => {
    const agency = await ctx.db.get(agencyId);
    const r = await ctx.db.get(vehicleId);
    if (
      agency?.status !== "active" ||
      !r ||
      r.agencyId !== agencyId ||
      r.lifecycle !== "active" ||
      !r.publicVisible
    )
      return null;
    const category = await ctx.db.get(r.categoryId);
    const branch = await ctx.db.get(r.branchId);
    if (
      !category ||
      category.lifecycle !== "active" ||
      !category.publicVisible ||
      branch?.status !== "active"
    )
      return null;
    const features = await Promise.all(
      r.featureIds.map((id) => ctx.db.get(id)),
    );
    const images = await ctx.db
      .query("vehicleImages")
      .withIndex("by_agency_vehicle", (q) =>
        q.eq("agencyId", agencyId).eq("vehicleId", vehicleId),
      )
      .take(12);
    const photos = [];
    for (const image of images) {
      const file = await ctx.db.get(image.fileId);
      if (file) {
        const url = await ctx.storage.getUrl(file.storageId);
        if (url) photos.push({ url, alt: image.alt });
      }
    }
    return {
      make: r.make,
      model: r.model,
      trim: r.trim,
      year: r.year,
      color: r.color,
      transmission: r.transmission,
      fuel: r.fuel,
      seats: r.seats,
      doors: r.doors,
      description: r.description,
      category: category.labels,
      features: features
        .filter(
          (f) =>
            f &&
            f.agencyId === agencyId &&
            f.lifecycle === "active" &&
            f.publicVisible,
        )
        .map((f) => f!.labels),
      photos,
    };
  },
});
