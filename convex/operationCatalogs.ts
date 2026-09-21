import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import type { Id } from "./_generated/dataModel";
import { fleetAccess } from "./lib/fleet";
import {
  base,
  command,
  fail,
  operationAudit,
  revision,
} from "./lib/operations";
import {
  documentTypeDoc,
  templateDoc,
  templateItem,
  vendorDoc,
} from "./lib/operationsValidators";
import { labels } from "./lib/fleetValidators";
import { textValue, MAX_DOCUMENT_TYPES } from "../src/lib/operations";
import { labelsSchema } from "../src/lib/fleet";
const codeValue = (s: string) => {
  const code = s.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) fail();
  return code;
};
export const documentTypes = query({
  args: { agencyId: v.id("agencies") },
  returns: v.array(documentTypeDoc),
  handler: async (ctx, { agencyId }) => {
    await fleetAccess(ctx, agencyId, "document.vehicle.read");
    const rows = await ctx.db
      .query("vehicleDocumentTypes")
      .withIndex("by_agency_code", (q) => q.eq("agencyId", agencyId))
      .take(129);
    if (rows.length > 128) fail("OPERATIONS_LIMIT");
    return rows;
  },
});
export const saveDocumentType = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.optional(v.id("vehicleDocumentTypes")),
    expectedRevision: v.number(),
    code: v.string(),
    labels,
    required: v.boolean(),
    expiryRequired: v.boolean(),
    active: v.boolean(),
    requestKey: v.string(),
  },
  returns: v.id("vehicleDocumentTypes"),
  handler: async (ctx, args) => {
    const { user, agency } = await fleetAccess(
      ctx,
      args.agencyId,
      "document.vehicle.manage",
    );
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "catalog.document_type.save",
      args.requestKey,
      args,
      async () => {
        const current = args.id ? await ctx.db.get(args.id) : null;
        if (args.id && (!current || current.agencyId !== args.agencyId)) fail();
        if (current) revision(current, args.expectedRevision);
        const code = codeValue(args.code);
        if (current && current.code !== code) fail();
        const parsed = labelsSchema.safeParse(args.labels);
        if (!parsed.success) fail();
        const duplicate = await ctx.db
          .query("vehicleDocumentTypes")
          .withIndex("by_agency_code", (q) =>
            q.eq("agencyId", args.agencyId).eq("code", code),
          )
          .unique();
        if (duplicate && duplicate._id !== args.id)
          fail("OPERATIONS_CODE_TAKEN");
        const rows = await ctx.db
          .query("vehicleDocumentTypes")
          .withIndex("by_agency_code", (q) => q.eq("agencyId", args.agencyId))
          .take(129);
        if (!current && rows.length >= 128) fail("OPERATIONS_LIMIT");
        if (
          args.active &&
          !current?.active &&
          rows.filter((r) => r.active).length >= MAX_DOCUMENT_TYPES
        )
          fail("OPERATIONS_LIMIT");
        const values = {
          code,
          labels: parsed.data,
          required: args.required,
          expiryRequired: args.expiryRequired,
          active: args.active,
        };
        let id = current?._id;
        if (current)
          await ctx.db.patch(current._id, {
            ...values,
            revision: current.revision + 1,
          });
        else
          id = await ctx.db.insert("vehicleDocumentTypes", {
            ...base(args.agencyId, user._id),
            ...values,
          });
        await ctx.db.patch(agency._id, {
          complianceRevision: (agency.complianceRevision ?? 0) + 1,
        });
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "document_type.saved",
          id!,
        );
        return id!;
      },
    )) as Id<"vehicleDocumentTypes">;
  },
});

export const templates = query({
  args: { agencyId: v.id("agencies") },
  returns: v.array(templateDoc),
  handler: async (ctx, { agencyId }) => {
    await fleetAccess(ctx, agencyId, "inspection.read");
    const rows = await ctx.db
      .query("inspectionTemplates")
      .withIndex("by_agency_active", (q) =>
        q.eq("agencyId", agencyId).eq("active", true),
      )
      .take(33);
    if (rows.length > 32) fail("OPERATIONS_LIMIT");
    return rows;
  },
});
export const getTemplate = query({
  args: { agencyId: v.id("agencies"), id: v.id("inspectionTemplates") },
  returns: v.union(v.null(), templateDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId, "inspection.read");
    const row = await ctx.db.get(args.id);
    return row?.agencyId === args.agencyId ? row : null;
  },
});
export const templateHistory = query({
  args: {
    agencyId: v.id("agencies"),
    active: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({ template: templateDoc, latest: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId, "inspection.read");
    const page = await ctx.db
      .query("inspectionTemplates")
      .withIndex("by_agency_active", (q) =>
        q.eq("agencyId", args.agencyId).eq("active", args.active),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
    const rows = await Promise.all(
      page.page.map(async (template) => {
        const latest = await ctx.db
          .query("inspectionTemplates")
          .withIndex("by_agency_code_version", (q) =>
            q.eq("agencyId", args.agencyId).eq("code", template.code),
          )
          .order("desc")
          .first();
        return { template, latest: latest?._id === template._id };
      }),
    );
    return { ...page, page: rows };
  },
});
export const setTemplateActive = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("inspectionTemplates"),
    expectedRevision: v.number(),
    active: v.boolean(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "inspection.manage");
    await command(
      ctx,
      args.agencyId,
      user._id,
      "catalog.template.lifecycle",
      args.requestKey,
      args,
      async () => {
        const current = await ctx.db.get(args.id);
        if (!current || current.agencyId !== args.agencyId) fail();
        revision(current, args.expectedRevision);
        const latest = await ctx.db
          .query("inspectionTemplates")
          .withIndex("by_agency_code_version", (q) =>
            q.eq("agencyId", args.agencyId).eq("code", current.code),
          )
          .order("desc")
          .first();
        if (latest?._id !== current._id) fail("OPERATIONS_CONFLICT");
        if (args.active && !current.active) {
          const active = await ctx.db
            .query("inspectionTemplates")
            .withIndex("by_agency_active", (q) =>
              q.eq("agencyId", args.agencyId).eq("active", true),
            )
            .take(33);
          if (active.length >= 32) fail("OPERATIONS_LIMIT");
        }
        await ctx.db.patch(current._id, {
          active: args.active,
          revision: current.revision + 1,
        });
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          args.active ? "template.restored" : "template.archived",
          current._id,
        );
        return current._id;
      },
    );
    return null;
  },
});
export const saveTemplate = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.optional(v.id("inspectionTemplates")),
    expectedRevision: v.number(),
    code: v.string(),
    name: labels,
    items: v.array(templateItem),
    active: v.boolean(),
    requestKey: v.string(),
  },
  returns: v.id("inspectionTemplates"),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "inspection.manage");
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "catalog.template.save",
      args.requestKey,
      args,
      async () => {
        const current = args.id ? await ctx.db.get(args.id) : null;
        if (
          args.id &&
          (!current || current.agencyId !== args.agencyId || !current.active)
        )
          fail("OPERATIONS_CONFLICT");
        if (current) revision(current, args.expectedRevision);
        const code = codeValue(args.code);
        if (current && current.code !== code) fail();
        const name = labelsSchema.safeParse(args.name);
        if (!name.success || args.items.length < 1 || args.items.length > 32)
          fail();
        const codes = new Set<string>();
        const items = args.items.map((item) => {
          const key = codeValue(item.code);
          const parsed = labelsSchema.safeParse(item.labels);
          if (codes.has(key) || !parsed.success) fail();
          codes.add(key);
          return {
            ...item,
            code: key,
            labels: parsed.data,
            required: item.required || item.safety,
          };
        });
        const prior = await ctx.db
          .query("inspectionTemplates")
          .withIndex("by_agency_code_version", (q) =>
            q.eq("agencyId", args.agencyId).eq("code", code),
          )
          .order("desc")
          .first();
        if (prior && prior._id !== current?._id) fail("OPERATIONS_CODE_TAKEN");
        const active = await ctx.db
          .query("inspectionTemplates")
          .withIndex("by_agency_active", (q) =>
            q.eq("agencyId", args.agencyId).eq("active", true),
          )
          .take(33);
        if (!current && args.active && active.length >= 32)
          fail("OPERATIONS_LIMIT");
        if (current)
          await ctx.db.patch(current._id, {
            active: false,
            revision: current.revision + 1,
          });
        const id = await ctx.db.insert("inspectionTemplates", {
          ...base(args.agencyId, user._id),
          code,
          name: name.data,
          version: (prior?.version ?? 0) + 1,
          items,
          active: args.active,
        });
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "template.versioned",
          id,
        );
        return id;
      },
    )) as Id<"inspectionTemplates">;
  },
});

export const vendors = query({
  args: { agencyId: v.id("agencies") },
  returns: v.array(vendorDoc),
  handler: async (ctx, { agencyId }) => {
    await fleetAccess(ctx, agencyId, "maintenance.read");
    const rows = await ctx.db
      .query("maintenanceVendors")
      .withIndex("by_agency_active", (q) => q.eq("agencyId", agencyId))
      .take(201);
    if (rows.length > 200) fail("OPERATIONS_LIMIT");
    return rows;
  },
});
export const saveVendor = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.optional(v.id("maintenanceVendors")),
    expectedRevision: v.number(),
    name: v.string(),
    phone: v.string(),
    email: v.string(),
    address: v.string(),
    active: v.boolean(),
    requestKey: v.string(),
  },
  returns: v.id("maintenanceVendors"),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.manage",
    );
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "catalog.vendor.save",
      args.requestKey,
      args,
      async () => {
        const current = args.id ? await ctx.db.get(args.id) : null;
        if (args.id && (!current || current.agencyId !== args.agencyId)) fail();
        if (current) revision(current, args.expectedRevision);
        const values = {
          name: textValue(args.name, 160, true),
          phone: textValue(args.phone, 32),
          email: textValue(args.email, 254),
          address: textValue(args.address, 500),
          active: args.active,
        };
        if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
          fail();
        if (current) {
          await ctx.db.patch(current._id, {
            ...values,
            revision: current.revision + 1,
          });
          return current._id;
        }
        const rows = await ctx.db
          .query("maintenanceVendors")
          .withIndex("by_agency_active", (q) => q.eq("agencyId", args.agencyId))
          .take(201);
        if (rows.length >= 200) fail("OPERATIONS_LIMIT");
        const id = await ctx.db.insert("maintenanceVendors", {
          ...base(args.agencyId, user._id),
          ...values,
        });
        await operationAudit(ctx, args.agencyId, user._id, "vendor.saved", id);
        return id;
      },
    )) as Id<"maintenanceVendors">;
  },
});

export const vehicles = query({
  args: { agencyId: v.id("agencies") },
  returns: v.array(
    v.object({ id: v.id("vehicles"), label: v.string(), active: v.boolean() }),
  ),
  handler: async (ctx, { agencyId }) => {
    await fleetAccess(ctx, agencyId);
    const rows = await ctx.db
      .query("vehicles")
      .withIndex("by_agency_fleet", (q) => q.eq("agencyId", agencyId))
      .take(1001);
    if (rows.length > 1000) fail("OPERATIONS_LIMIT");
    return rows.map((r) => ({
      id: r._id,
      label: `${r.fleetNumber} · ${r.make} ${r.model}`,
      active: r.lifecycle === "active",
    }));
  },
});
