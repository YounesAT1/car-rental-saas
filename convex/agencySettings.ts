import { ConvexError, v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { mutation, query } from "./_generated/server";
import {
  requireAgencyMembership,
  requirePermission,
  writeAudit,
} from "./lib/auth";
import {
  businessFields,
  businessValidator,
  policyDto,
  policyValidator,
} from "./lib/settingsValidators";
import { settingsSchemas } from "../src/lib/agency-settings";
import type { Doc } from "./_generated/dataModel";

const schemas = settingsSchemas();
const settingsDto = v.object({
  ...businessFields,
  id: v.id("agencies"),
  slug: v.string(),
  revision: v.number(),
});

function businessValue(a: Doc<"agencies">) {
  return {
    id: a._id,
    name: a.name,
    slug: a.slug,
    legalName: a.legalName ?? "",
    contactEmail: a.contactEmail ?? "",
    phone: a.phone ?? "",
    website: a.website ?? "",
    address: a.address ?? "",
    city: a.city ?? "",
    postalCode: a.postalCode ?? "",
    country: a.country ?? "MA",
    timezone: a.timezone,
    currency: a.currency,
    defaultLocale: a.defaultLocale ?? ("en" as const),
    revision: a.revision ?? 0,
  };
}
function policyValue(p: Doc<"agencyPolicyVersions">) {
  return {
    id: p._id,
    agencyId: p.agencyId,
    version: p.version,
    currency: p.currency,
    effectiveAt: p.effectiveAt,
    actorUserId: p.actorUserId,
    minimumDriverAge: p.minimumDriverAge,
    minimumLicenseYears: p.minimumLicenseYears,
    maximumRentalDays: p.maximumRentalDays,
    preparationMinutes: p.preparationMinutes,
    graceMinutes: p.graceMinutes,
    bookingHorizonDays: p.bookingHorizonDays,
    includedKmPerDay: p.includedKmPerDay,
    fuelPolicy: p.fuelPolicy,
    depositAmountMinor: p.depositAmountMinor,
    freeCancellationHours: p.freeCancellationHours,
    terms: p.terms,
  };
}

export const getBusiness = query({
  args: { agencyId: v.id("agencies") },
  returns: settingsDto,
  handler: async (ctx, { agencyId }) => {
    const { agency, membership } = await requireAgencyMembership(ctx, agencyId);
    requirePermission(membership, "agency.settings");
    return businessValue(agency);
  },
});

export const saveBusiness = mutation({
  args: {
    agencyId: v.id("agencies"),
    expectedRevision: v.number(),
    values: businessValidator,
  },
  returns: settingsDto,
  handler: async (ctx, { agencyId, expectedRevision, values }) => {
    const { agency, membership, user } = await requireAgencyMembership(
      ctx,
      agencyId,
    );
    requirePermission(membership, "agency.settings");
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision !== (agency.revision ?? 0)
    )
      throw new ConvexError("SETTINGS_CONFLICT");
    const parsed = schemas.business.safeParse(values);
    if (!parsed.success) throw new ConvexError("INVALID_SETTINGS");
    const change = {
      ...parsed.data,
      revision: expectedRevision + 1,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(agencyId, change);
    await writeAudit(ctx, {
      agencyId,
      actorUserId: user._id,
      action: "agency.settings.updated",
      targetType: "agency",
      targetId: agencyId,
    });
    return businessValue({ ...agency, ...change });
  },
});

export const getCurrentPolicy = query({
  args: { agencyId: v.id("agencies") },
  returns: v.object({
    policy: v.union(policyDto, v.null()),
    currency: v.string(),
    agencyRevision: v.number(),
  }),
  handler: async (ctx, { agencyId }) => {
    const { agency } = await requireAgencyMembership(ctx, agencyId);
    const policy = await ctx.db
      .query("agencyPolicyVersions")
      .withIndex("by_agency_version", (q) => q.eq("agencyId", agencyId))
      .order("desc")
      .first();
    return {
      policy: policy ? policyValue(policy) : null,
      currency: agency.currency,
      agencyRevision: agency.revision ?? 0,
    };
  },
});

export const listPolicyHistory = query({
  args: { agencyId: v.id("agencies"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(policyDto),
  handler: async (ctx, { agencyId, paginationOpts }) => {
    await requireAgencyMembership(ctx, agencyId);
    const page = await ctx.db
      .query("agencyPolicyVersions")
      .withIndex("by_agency_version", (q) => q.eq("agencyId", agencyId))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 20),
      });
    return { ...page, page: page.page.map(policyValue) };
  },
});

export const publishPolicy = mutation({
  args: {
    agencyId: v.id("agencies"),
    expectedVersion: v.number(),
    expectedAgencyRevision: v.number(),
    values: policyValidator,
  },
  returns: policyDto,
  handler: async (
    ctx,
    { agencyId, expectedVersion, expectedAgencyRevision, values },
  ) => {
    const { agency, membership, user } = await requireAgencyMembership(
      ctx,
      agencyId,
    );
    requirePermission(membership, "agency.settings");
    const current = await ctx.db
      .query("agencyPolicyVersions")
      .withIndex("by_agency_version", (q) => q.eq("agencyId", agencyId))
      .order("desc")
      .first();
    if (
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion !== (current?.version ?? 0) ||
      expectedAgencyRevision !== (agency.revision ?? 0)
    )
      throw new ConvexError("SETTINGS_CONFLICT");
    const parsed = schemas.policy.safeParse(values);
    if (!parsed.success) throw new ConvexError("INVALID_SETTINGS");
    const record = {
      ...parsed.data,
      agencyId,
      version: expectedVersion + 1,
      currency: agency.currency,
      effectiveAt: Date.now(),
      actorUserId: user._id,
    };
    const id = await ctx.db.insert("agencyPolicyVersions", record);
    await ctx.db.patch(agencyId, { policyVersion: record.version });
    await writeAudit(ctx, {
      agencyId,
      actorUserId: user._id,
      action: "agency.policy.published",
      targetType: "agencyPolicyVersion",
      targetId: id,
      metadata: JSON.stringify({ version: record.version }),
    });
    return { id, ...record };
  },
});
