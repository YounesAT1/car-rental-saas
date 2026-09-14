import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { fleetAccess, ownedVehicle } from "./lib/fleet";
import {
  base,
  command,
  fail,
  operationAudit,
  revision,
} from "./lib/operations";
import {
  documentTypeDoc,
  documentValidator,
  vehicleDocumentDoc,
  vehicleDocumentFields,
} from "./lib/operationsValidators";
import {
  addDays,
  expiryInstant,
  textValue,
  validDate,
} from "../src/lib/operations";

const complianceState = v.union(
  v.literal("missing"),
  v.literal("processing"),
  v.literal("valid"),
  v.literal("expiring"),
  v.literal("expired"),
);

const complianceItem = v.object({
  type: documentTypeDoc,
  document: v.union(vehicleDocumentDoc, v.null()),
  state: complianceState,
});

const documentHistory = documentValidator("vehicleDocuments", {
  ...vehicleDocumentFields,
});

function stateFor(
  document: {
    status: "draft" | "current" | "superseded";
    expiresAt?: number;
  } | null,
  timezone: string,
  now = Date.now(),
) {
  if (!document) return "missing" as const;
  if (document.status === "draft") return "processing" as const;
  if (document.expiresAt === undefined) return "valid" as const;
  if (document.expiresAt <= now) return "expired" as const;
  return document.expiresAt <= addDays(now, 30, timezone)
    ? ("expiring" as const)
    : ("valid" as const);
}

export const compliance = query({
  args: { agencyId: v.id("agencies"), vehicleId: v.id("vehicles") },
  returns: v.array(complianceItem),
  handler: async (ctx, args) => {
    const { agency } = await fleetAccess(
      ctx,
      args.agencyId,
      "document.vehicle.read",
    );
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    const types = await ctx.db
      .query("vehicleDocumentTypes")
      .withIndex("by_agency_active", (q) =>
        q.eq("agencyId", args.agencyId).eq("active", true),
      )
      .take(33);
    if (types.length > 32) fail("OPERATIONS_LIMIT");
    return Promise.all(
      types.map(async (type) => {
        const current = await ctx.db
          .query("vehicleDocuments")
          .withIndex("by_agency_vehicle_type_status", (q) =>
            q
              .eq("agencyId", args.agencyId)
              .eq("vehicleId", args.vehicleId)
              .eq("typeId", type._id)
              .eq("status", "current"),
          )
          .unique();
        if (current)
          return {
            type,
            document: current,
            state: stateFor(current, agency.timezone),
          };
        const draft = await ctx.db
          .query("vehicleDocuments")
          .withIndex("by_agency_vehicle_type_status", (q) =>
            q
              .eq("agencyId", args.agencyId)
              .eq("vehicleId", args.vehicleId)
              .eq("typeId", type._id)
              .eq("status", "draft"),
          )
          .unique();
        return {
          type,
          document: draft,
          state: stateFor(draft, agency.timezone),
        };
      }),
    );
  },
});

export const history = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(documentHistory),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId, "document.vehicle.read");
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    return ctx.db
      .query("vehicleDocuments")
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

export const saveDraft = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    id: v.optional(v.id("vehicleDocuments")),
    expectedRevision: v.number(),
    typeId: v.id("vehicleDocumentTypes"),
    number: v.string(),
    issuer: v.string(),
    issuedDate: v.string(),
    expiryDate: v.string(),
    requestKey: v.string(),
  },
  returns: v.id("vehicleDocuments"),
  handler: async (ctx, args) => {
    const { user, agency } = await fleetAccess(
      ctx,
      args.agencyId,
      "document.vehicle.manage",
    );
    const vehicle = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    if (vehicle.lifecycle !== "active") fail("FLEET_ARCHIVED");
    const type = await ctx.db.get(args.typeId);
    if (!type || type.agencyId !== args.agencyId || !type.active)
      fail("DOCUMENT_TYPE_UNAVAILABLE");
    const current = args.id ? await ctx.db.get(args.id) : null;
    if (
      args.id &&
      (!current ||
        current.agencyId !== args.agencyId ||
        current.vehicleId !== args.vehicleId ||
        current.status !== "draft")
    )
      fail("DOCUMENT_LOCKED");
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "document.draft.save",
      args.requestKey,
      args,
      async () => {
        if (current) revision(current, args.expectedRevision);
        const otherDraft = await ctx.db
          .query("vehicleDocuments")
          .withIndex("by_agency_vehicle_type_status", (q) =>
            q
              .eq("agencyId", args.agencyId)
              .eq("vehicleId", args.vehicleId)
              .eq("typeId", args.typeId)
              .eq("status", "draft"),
          )
          .unique();
        if (otherDraft && otherDraft._id !== current?._id)
          fail("DOCUMENT_DRAFT_EXISTS");
        const issuedDate = args.issuedDate ? validDate(args.issuedDate) : "";
        const expiryDate = args.expiryDate ? validDate(args.expiryDate) : "";
        if (type.expiryRequired && !expiryDate)
          fail("DOCUMENT_EXPIRY_REQUIRED");
        if (issuedDate && expiryDate && expiryDate < issuedDate) fail();
        const values = {
          vehicleId: args.vehicleId,
          typeId: args.typeId,
          number: textValue(args.number, 120),
          issuer: textValue(args.issuer, 160),
          issuedDate,
          expiryDate,
          expiresAt: expiryDate
            ? expiryInstant(expiryDate, agency.timezone)
            : undefined,
          timezone: agency.timezone,
          status: "draft" as const,
        };
        let id = current?._id;
        if (current)
          await ctx.db.patch(current._id, {
            ...values,
            revision: current.revision + 1,
          });
        else
          id = await ctx.db.insert("vehicleDocuments", {
            ...base(args.agencyId, user._id),
            ...values,
          });
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "document.draft_saved",
          id!,
        );
        return id!;
      },
    )) as Id<"vehicleDocuments">;
  },
});
