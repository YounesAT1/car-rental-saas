import { ConvexError, v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireAgencyMembership,
  requirePermission,
  writeAudit,
} from "./lib/auth";
import {
  branchDto,
  branchStatus,
  branchValidator,
} from "./lib/settingsValidators";
import { settingsSchemas } from "../src/lib/agency-settings";

const schema = settingsSchemas().branch;
function dto(branch: Doc<"branches">) {
  return {
    id: branch._id,
    agencyId: branch.agencyId,
    name: branch.name,
    code: branch.code,
    address: branch.address,
    city: branch.city,
    postalCode: branch.postalCode,
    country: branch.country,
    timezone: branch.timezone,
    phone: branch.phone,
    contactEmail: branch.contactEmail,
    hours: branch.hours,
    closures: branch.closures,
    status: branch.status,
    revision: branch.revision,
    updatedAt: branch.updatedAt,
  };
}
async function ownedBranch(
  ctx: QueryCtx | MutationCtx,
  agencyId: Id<"agencies">,
  branchId: Id<"branches">,
) {
  const branch = await ctx.db.get(branchId);
  if (!branch || branch.agencyId !== agencyId)
    throw new ConvexError("BRANCH_NOT_FOUND");
  return branch;
}

export const list = query({
  args: {
    agencyId: v.id("agencies"),
    status: branchStatus,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(branchDto),
  handler: async (ctx, { agencyId, status, paginationOpts }) => {
    await requireAgencyMembership(ctx, agencyId);
    const page = await ctx.db
      .query("branches")
      .withIndex("by_agency_status", (q) =>
        q.eq("agencyId", agencyId).eq("status", status),
      )
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 20),
      });
    return { ...page, page: page.page.map(dto) };
  },
});
export const get = query({
  args: { agencyId: v.id("agencies"), branchId: v.id("branches") },
  returns: branchDto,
  handler: async (ctx, { agencyId, branchId }) => {
    await requireAgencyMembership(ctx, agencyId);
    return dto(await ownedBranch(ctx, agencyId, branchId));
  },
});
export const create = mutation({
  args: { agencyId: v.id("agencies"), values: branchValidator },
  returns: branchDto,
  handler: async (ctx, { agencyId, values }) => {
    const { membership, user } = await requireAgencyMembership(ctx, agencyId);
    requirePermission(membership, "branch.manage");
    const parsed = schema.safeParse(values);
    if (!parsed.success) throw new ConvexError("INVALID_SETTINGS");
    const duplicate = await ctx.db
      .query("branches")
      .withIndex("by_agency_code", (q) =>
        q.eq("agencyId", agencyId).eq("code", parsed.data.code),
      )
      .unique();
    if (duplicate) throw new ConvexError("BRANCH_CODE_TAKEN");
    const existing = await ctx.db
      .query("branches")
      .withIndex("by_agency_code", (q) => q.eq("agencyId", agencyId))
      .take(100);
    if (existing.length >= 100) throw new ConvexError("BRANCH_LIMIT");
    const record = {
      ...parsed.data,
      agencyId,
      status: "active" as const,
      revision: 1,
      updatedAt: Date.now(),
      createdByUserId: user._id,
    };
    const id = await ctx.db.insert("branches", record);
    await writeAudit(ctx, {
      agencyId,
      actorUserId: user._id,
      action: "branch.created",
      targetType: "branch",
      targetId: id,
    });
    return dto({ _id: id, _creationTime: record.updatedAt, ...record });
  },
});
export const update = mutation({
  args: {
    agencyId: v.id("agencies"),
    branchId: v.id("branches"),
    expectedRevision: v.number(),
    values: branchValidator,
  },
  returns: branchDto,
  handler: async (ctx, { agencyId, branchId, expectedRevision, values }) => {
    const { membership, user } = await requireAgencyMembership(ctx, agencyId);
    requirePermission(membership, "branch.manage");
    const branch = await ownedBranch(ctx, agencyId, branchId);
    if (branch.status !== "active") throw new ConvexError("BRANCH_ARCHIVED");
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision !== branch.revision
    )
      throw new ConvexError("SETTINGS_CONFLICT");
    const parsed = schema.safeParse(values);
    if (!parsed.success) throw new ConvexError("INVALID_SETTINGS");
    const duplicate = await ctx.db
      .query("branches")
      .withIndex("by_agency_code", (q) =>
        q.eq("agencyId", agencyId).eq("code", parsed.data.code),
      )
      .unique();
    if (duplicate && duplicate._id !== branchId)
      throw new ConvexError("BRANCH_CODE_TAKEN");
    const change = {
      ...parsed.data,
      revision: branch.revision + 1,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(branchId, change);
    await writeAudit(ctx, {
      agencyId,
      actorUserId: user._id,
      action: "branch.updated",
      targetType: "branch",
      targetId: branchId,
    });
    return dto({ ...branch, ...change });
  },
});
export const setStatus = mutation({
  args: {
    agencyId: v.id("agencies"),
    branchId: v.id("branches"),
    expectedRevision: v.number(),
    status: branchStatus,
  },
  returns: branchDto,
  handler: async (ctx, { agencyId, branchId, expectedRevision, status }) => {
    const { membership, user } = await requireAgencyMembership(ctx, agencyId);
    requirePermission(membership, "branch.manage");
    const branch = await ownedBranch(ctx, agencyId, branchId);
    if (
      !Number.isSafeInteger(expectedRevision) ||
      branch.revision !== expectedRevision
    )
      throw new ConvexError("SETTINGS_CONFLICT");
    if (branch.status === status) return dto(branch);
    const change = {
      status,
      revision: branch.revision + 1,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(branchId, change);
    await writeAudit(ctx, {
      agencyId,
      actorUserId: user._id,
      action: status === "archived" ? "branch.archived" : "branch.restored",
      targetType: "branch",
      targetId: branchId,
    });
    return dto({ ...branch, ...change });
  },
});
