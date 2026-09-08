import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  canGrantRole,
  hasPermission,
  rolePermissions,
  type RoleKey,
} from "./lib/permissions";
import {
  countActiveOwners,
  findUserByIdentity,
  requireAgencyMembership,
  requireIdentity,
  requireUser,
  requirePermission,
  writeAudit,
} from "./lib/auth";

const roleValidator = v.union(
  v.literal("AGENCY_OWNER"),
  v.literal("AGENCY_ADMIN"),
  v.literal("MANAGER"),
  v.literal("RENTAL_AGENT"),
  v.literal("FLEET_MANAGER"),
  v.literal("MAINTENANCE_MANAGER"),
  v.literal("ACCOUNTANT"),
  v.literal("EMPLOYEE"),
  v.literal("READ_ONLY"),
);

const localeValidator = v.union(
  v.literal("en"),
  v.literal("fr"),
  v.literal("ar"),
);

const userDto = v.object({
  id: v.id("users"),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
  status: v.union(v.literal("active"), v.literal("disabled")),
});

const agencyDto = v.object({
  id: v.id("agencies"),
  name: v.string(),
  slug: v.string(),
  timezone: v.string(),
  currency: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("suspended"),
    v.literal("archived"),
  ),
});

const membershipDto = v.object({
  id: v.id("agencyMembers"),
  roleKey: roleValidator,
  status: v.union(
    v.literal("active"),
    v.literal("revoked"),
    v.literal("suspended"),
  ),
  branchScope: v.literal("all"),
});

const workspaceDto = v.object({
  user: userDto,
  agency: agencyDto,
  membership: membershipDto,
  permissions: v.array(v.string()),
});

function normalizeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 3 || slug.length > 80)
    throw new Error("INVALID_AGENCY_SLUG");
  return slug;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("INVALID_EMAIL");
  return email;
}

function userDtoValue(user: {
  _id: Id<"users">;
  name?: string;
  email?: string;
  imageUrl?: string;
  status: "active" | "disabled";
}) {
  return {
    id: user._id,
    name: user.name ?? null,
    email: user.email ?? null,
    imageUrl: user.imageUrl ?? null,
    status: user.status,
  };
}

function agencyDtoValue(agency: {
  _id: Id<"agencies">;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  status: "active" | "suspended" | "archived";
}) {
  return {
    id: agency._id,
    name: agency.name,
    slug: agency.slug,
    timezone: agency.timezone,
    currency: agency.currency,
    status: agency.status,
  };
}

function membershipDtoValue(member: {
  _id: Id<"agencyMembers">;
  roleKey: RoleKey;
  status: "active" | "revoked" | "suspended";
  branchScope: "all";
}) {
  return {
    id: member._id,
    roleKey: member.roleKey,
    status: member.status,
    branchScope: member.branchScope,
  };
}

async function workspaceValue(
  ctx: Parameters<typeof requireAgencyMembership>[0],
  agencyId: Id<"agencies">,
) {
  const current = await requireAgencyMembership(ctx, agencyId);
  return {
    user: userDtoValue(current.user),
    agency: agencyDtoValue(current.agency),
    membership: membershipDtoValue(current.membership),
    permissions: [...rolePermissions[current.membership.roleKey]],
  };
}

async function hashInvitationToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function createInvitationToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export const ensureCurrentUser = mutation({
  args: { locale: v.optional(localeValidator) },
  returns: userDto,
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existing = await findUserByIdentity(ctx, identity);
    if (existing?.status === "disabled") throw new Error("USER_DISABLED");
    const now = Date.now();
    const fields = {
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.email ? { email: normalizeEmail(identity.email) } : {}),
      ...(identity.pictureUrl ? { imageUrl: identity.pictureUrl } : {}),
      ...(args.locale ? { locale: args.locale } : {}),
      identityUpdatedAt: now,
      status: "active" as const,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      const preferences = await ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", existing._id))
        .unique();
      if (!preferences)
        await ctx.db.insert("userPreferences", { userId: existing._id });
      return userDtoValue({ ...existing, ...fields });
    }

    const userId = await ctx.db.insert("users", {
      issuer: identity.issuer,
      subject: identity.subject,
      ...fields,
    });
    await ctx.db.insert("userPreferences", { userId });
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("PROFILE_SYNC_FAILED");
    return userDtoValue(user);
  },
});

export const getCurrentUser = query({
  args: {},
  returns: v.union(userDto, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await findUserByIdentity(ctx, identity);
    return user ? userDtoValue(user) : null;
  },
});

export const listAgencies = query({
  args: {},
  returns: v.array(v.object({ agency: agencyDto, membership: membershipDto })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await findUserByIdentity(ctx, identity);
    if (!user || user.status !== "active") return [];
    const memberships = await ctx.db
      .query("agencyMembers")
      .withIndex("by_user_status", (query) =>
        query.eq("userId", user._id).eq("status", "active"),
      )
      .take(100);
    const result = [];
    for (const membership of memberships) {
      const agency = await ctx.db.get(membership.agencyId);
      if (agency?.status === "active") {
        result.push({
          agency: agencyDtoValue(agency),
          membership: membershipDtoValue(membership),
        });
      }
    }
    const preferences = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (preferences?.lastAgencyId) {
      const selected = result.findIndex(
        (entry) => entry.agency.id === preferences.lastAgencyId,
      );
      if (selected > 0) result.unshift(...result.splice(selected, 1));
    }
    return result;
  },
});

export const getWorkspace = query({
  args: { agencyId: v.id("agencies") },
  returns: v.union(workspaceDto, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await findUserByIdentity(ctx, identity);
    const agency = await ctx.db.get(args.agencyId);
    if (
      !user ||
      user.status !== "active" ||
      !agency ||
      agency.status !== "active"
    )
      return null;
    const membership = await ctx.db
      .query("agencyMembers")
      .withIndex("by_agency_user", (query) =>
        query.eq("agencyId", args.agencyId).eq("userId", user._id),
      )
      .unique();
    if (!membership || membership.status !== "active") return null;
    return {
      user: userDtoValue(user),
      agency: agencyDtoValue(agency),
      membership: membershipDtoValue(membership),
      permissions: [...rolePermissions[membership.roleKey]],
    };
  },
});

export const createAgency = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    timezone: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  returns: workspaceDto,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 2 || name.length > 160)
      throw new Error("INVALID_AGENCY_NAME");
    const slug = normalizeSlug(args.slug);
    const duplicate = await ctx.db
      .query("agencies")
      .withIndex("by_slug", (query) => query.eq("slug", slug))
      .unique();
    if (duplicate) throw new Error("AGENCY_SLUG_TAKEN");

    const agencyId = await ctx.db.insert("agencies", {
      name,
      slug,
      status: "active",
      timezone: args.timezone?.trim() || "Africa/Casablanca",
      currency: args.currency?.trim().toUpperCase() || "MAD",
      policyVersion: 1,
      createdByUserId: user._id,
    });
    await ctx.db.insert("agencyMembers", {
      agencyId,
      userId: user._id,
      roleKey: "AGENCY_OWNER",
      status: "active",
      branchScope: "all",
      joinedAt: Date.now(),
      revision: 1,
    });
    const preferences = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (query) => query.eq("userId", user._id))
      .unique();
    if (preferences)
      await ctx.db.patch(preferences._id, { lastAgencyId: agencyId });
    else
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastAgencyId: agencyId,
      });
    await writeAudit(ctx, {
      agencyId,
      actorUserId: user._id,
      action: "agency.created",
      targetType: "agency",
      targetId: agencyId,
    });
    return workspaceValue(ctx, agencyId);
  },
});

export const selectAgency = mutation({
  args: { agencyId: v.id("agencies") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const { user } = await requireAgencyMembership(ctx, args.agencyId);
    const preferences = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (query) => query.eq("userId", user._id))
      .unique();
    if (preferences)
      await ctx.db.patch(preferences._id, { lastAgencyId: args.agencyId });
    else
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastAgencyId: args.agencyId,
      });
    return { ok: true as const };
  },
});

export const createInvitation = mutation({
  args: {
    agencyId: v.id("agencies"),
    email: v.string(),
    roleKey: roleValidator,
    requestKey: v.string(),
  },
  returns: v.object({
    invitationId: v.id("agencyInvitations"),
    token: v.union(v.string(), v.null()),
    expiresAt: v.number(),
    replayed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const current = await requireAgencyMembership(ctx, args.agencyId);
    requirePermission(current.membership, "employee.manage");
    if (!canGrantRole(current.membership.roleKey, args.roleKey))
      throw new Error("ROLE_GRANT_DENIED");
    const requestKey = args.requestKey.trim();
    if (requestKey.length < 8 || requestKey.length > 120)
      throw new Error("INVALID_REQUEST_KEY");
    const emailNormalized = normalizeEmail(args.email);
    const existingReceipt = await ctx.db
      .query("commandReceipts")
      .withIndex("by_command", (query) =>
        query
          .eq("agencyId", args.agencyId)
          .eq("principalKey", current.user._id)
          .eq("operation", "agency.invitation.create")
          .eq("key", requestKey),
      )
      .unique();
    if (existingReceipt?.resultRef) {
      const invitation = await ctx.db.get(
        existingReceipt.resultRef as Id<"agencyInvitations">,
      );
      if (invitation) {
        if (
          invitation.agencyId !== args.agencyId ||
          invitation.emailNormalized !== emailNormalized ||
          invitation.roleKey !== args.roleKey
        ) {
          throw new Error("REQUEST_KEY_REUSED");
        }
        return {
          invitationId: invitation._id,
          token: null,
          expiresAt: invitation.expiresAt,
          replayed: true,
        };
      }
    }

    const duplicate = await ctx.db
      .query("agencyInvitations")
      .withIndex("by_agency_email_status", (query) =>
        query
          .eq("agencyId", args.agencyId)
          .eq("emailNormalized", emailNormalized)
          .eq("status", "pending"),
      )
      .unique();
    if (duplicate && duplicate.expiresAt > Date.now())
      throw new Error("INVITATION_ALREADY_PENDING");
    if (duplicate) await ctx.db.patch(duplicate._id, { status: "expired" });

    const token = createInvitationToken();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const invitationId = await ctx.db.insert("agencyInvitations", {
      agencyId: args.agencyId,
      emailNormalized,
      roleKey: args.roleKey,
      branchScope: "all",
      tokenHash: await hashInvitationToken(token),
      expiresAt,
      status: "pending",
      inviterUserId: current.user._id,
    });
    await ctx.db.insert("commandReceipts", {
      agencyId: args.agencyId,
      principalKey: current.user._id,
      operation: "agency.invitation.create",
      key: requestKey,
      resultRef: invitationId,
      expiresAt,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      agencyId: args.agencyId,
      actorUserId: current.user._id,
      action: "agency.invitation.created",
      targetType: "agencyInvitation",
      targetId: invitationId,
      metadata: JSON.stringify({
        roleKey: args.roleKey,
        email: emailNormalized,
      }),
      operationId: requestKey,
    });
    return { invitationId, token, expiresAt, replayed: false };
  },
});

export const acceptInvitation = mutation({
  args: { token: v.string() },
  returns: workspaceDto,
  handler: async (ctx, args) => {
    const current = await requireUser(ctx);
    if (!/^[a-f0-9]{64}$/.test(args.token.trim()))
      throw new Error("INVITATION_INVALID");
    const tokenHash = await hashInvitationToken(args.token.trim());
    const invitation = await ctx.db
      .query("agencyInvitations")
      .withIndex("by_token", (query) => query.eq("tokenHash", tokenHash))
      .unique();
    if (!invitation) throw new Error("INVITATION_INVALID");
    if (
      invitation.status === "accepted" &&
      invitation.acceptedUserId === current.user._id
    ) {
      // A transport retry may revisit acceptance, but must recheck current access.
      return workspaceValue(ctx, invitation.agencyId);
    }
    if (invitation.status !== "pending") throw new Error("INVITATION_INVALID");
    if (invitation.expiresAt <= Date.now()) {
      throw new Error("INVITATION_EXPIRED");
    }
    const email = current.identity.email
      ? normalizeEmail(current.identity.email)
      : null;
    if (!email || email !== invitation.emailNormalized)
      throw new Error("INVITATION_EMAIL_MISMATCH");
    if (current.identity.emailVerified !== true)
      throw new Error("EMAIL_NOT_VERIFIED");
    const agency = await ctx.db.get(invitation.agencyId);
    if (!agency || agency.status !== "active")
      throw new Error("AGENCY_ACCESS_DENIED");
    const inviter = await ctx.db
      .query("agencyMembers")
      .withIndex("by_agency_user", (query) =>
        query
          .eq("agencyId", invitation.agencyId)
          .eq("userId", invitation.inviterUserId),
      )
      .unique();
    if (
      !inviter ||
      inviter.status !== "active" ||
      !hasPermission(inviter.roleKey, "employee.manage")
    ) {
      throw new Error("INVITATION_REVOKED");
    }
    if (!canGrantRole(inviter.roleKey, invitation.roleKey))
      throw new Error("ROLE_GRANT_DENIED");
    const existing = await ctx.db
      .query("agencyMembers")
      .withIndex("by_agency_user", (query) =>
        query
          .eq("agencyId", invitation.agencyId)
          .eq("userId", current.user._id),
      )
      .unique();
    if (existing?.status === "active") throw new Error("ALREADY_A_MEMBER");
    if (existing) {
      await ctx.db.patch(existing._id, {
        roleKey: invitation.roleKey,
        status: "active",
        branchScope: "all",
        revision: existing.revision + 1,
      });
    } else {
      await ctx.db.insert("agencyMembers", {
        agencyId: invitation.agencyId,
        userId: current.user._id,
        roleKey: invitation.roleKey,
        status: "active",
        branchScope: "all",
        joinedAt: Date.now(),
        revision: 1,
      });
    }
    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedUserId: current.user._id,
      acceptedAt: Date.now(),
    });
    await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (query) => query.eq("userId", current.user._id))
      .unique()
      .then(async (preferences) => {
        if (preferences)
          await ctx.db.patch(preferences._id, {
            lastAgencyId: invitation.agencyId,
          });
        else
          await ctx.db.insert("userPreferences", {
            userId: current.user._id,
            lastAgencyId: invitation.agencyId,
          });
      });
    await writeAudit(ctx, {
      agencyId: invitation.agencyId,
      actorUserId: current.user._id,
      action: "agency.invitation.accepted",
      targetType: "agencyInvitation",
      targetId: invitation._id,
    });
    return workspaceValue(ctx, invitation.agencyId);
  },
});

export const updateMemberRole = mutation({
  args: {
    agencyId: v.id("agencies"),
    userId: v.id("users"),
    roleKey: roleValidator,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const current = await requireAgencyMembership(ctx, args.agencyId);
    requirePermission(current.membership, "employee.manage");
    if (!canGrantRole(current.membership.roleKey, args.roleKey))
      throw new Error("ROLE_GRANT_DENIED");
    const target = await ctx.db
      .query("agencyMembers")
      .withIndex("by_agency_user", (query) =>
        query.eq("agencyId", args.agencyId).eq("userId", args.userId),
      )
      .unique();
    if (!target || target.status !== "active")
      throw new Error("MEMBER_NOT_FOUND");
    if (target.roleKey === "AGENCY_OWNER" && args.roleKey !== "AGENCY_OWNER") {
      if ((await countActiveOwners(ctx, args.agencyId)) <= 1)
        throw new Error("LAST_OWNER_PROTECTED");
      if (current.membership.roleKey !== "AGENCY_OWNER")
        throw new Error("OWNER_ONLY");
    }
    await ctx.db.patch(target._id, {
      roleKey: args.roleKey,
      revision: target.revision + 1,
    });
    await writeAudit(ctx, {
      agencyId: args.agencyId,
      actorUserId: current.user._id,
      action: "agency.member.role_changed",
      targetType: "agencyMember",
      targetId: target._id,
      metadata: JSON.stringify({ from: target.roleKey, to: args.roleKey }),
    });
    return { ok: true as const };
  },
});

export const revokeMembership = mutation({
  args: { agencyId: v.id("agencies"), userId: v.id("users") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const current = await requireAgencyMembership(ctx, args.agencyId);
    requirePermission(current.membership, "employee.manage");
    const target = await ctx.db
      .query("agencyMembers")
      .withIndex("by_agency_user", (query) =>
        query.eq("agencyId", args.agencyId).eq("userId", args.userId),
      )
      .unique();
    if (!target || target.status !== "active")
      throw new Error("MEMBER_NOT_FOUND");
    if (target.roleKey === "AGENCY_OWNER") {
      if (current.membership.roleKey !== "AGENCY_OWNER")
        throw new Error("OWNER_ONLY");
      if ((await countActiveOwners(ctx, args.agencyId)) <= 1)
        throw new Error("LAST_OWNER_PROTECTED");
    }
    await ctx.db.patch(target._id, {
      status: "revoked",
      revision: target.revision + 1,
    });
    await writeAudit(ctx, {
      agencyId: args.agencyId,
      actorUserId: current.user._id,
      action: "agency.member.revoked",
      targetType: "agencyMember",
      targetId: target._id,
    });
    return { ok: true as const };
  },
});
