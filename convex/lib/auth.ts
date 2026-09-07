import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hasPermission, type PermissionId, type RoleKey } from "./permissions";

type ReadCtx = QueryCtx | MutationCtx;
type AuthIdentity = NonNullable<
  Awaited<ReturnType<QueryCtx["auth"]["getUserIdentity"]>>
>;

export type CurrentUser = {
  identity: AuthIdentity;
  user: Doc<"users">;
};

export async function requireIdentity(ctx: ReadCtx): Promise<AuthIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("UNAUTHENTICATED");
  if (!identity.issuer || !identity.subject)
    throw new Error("INVALID_IDENTITY");
  return identity;
}

export async function requireUser(ctx: ReadCtx): Promise<CurrentUser> {
  const identity = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_identity", (query) =>
      query.eq("issuer", identity.issuer).eq("subject", identity.subject),
    )
    .unique();
  if (!user) throw new Error("PROFILE_NOT_SYNCED");
  if (user.status !== "active") throw new Error("USER_DISABLED");
  return { identity, user };
}

export async function requireAgencyMembership(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
) {
  const current = await requireUser(ctx);
  const agency = await ctx.db.get(agencyId);
  const membership = await ctx.db
    .query("agencyMembers")
    .withIndex("by_agency_user", (query) =>
      query.eq("agencyId", agencyId).eq("userId", current.user._id),
    )
    .unique();
  if (
    !agency ||
    agency.status !== "active" ||
    !membership ||
    membership.status !== "active"
  ) {
    throw new Error("AGENCY_ACCESS_DENIED");
  }
  return { ...current, agency, membership };
}

export function requirePermission(
  membership: Doc<"agencyMembers">,
  permission: PermissionId,
) {
  if (!hasPermission(membership.roleKey as RoleKey, permission)) {
    throw new Error("PERMISSION_DENIED");
  }
}

export async function findUserByIdentity(ctx: ReadCtx, identity: AuthIdentity) {
  if (!identity.issuer || !identity.subject) return null;
  return ctx.db
    .query("users")
    .withIndex("by_identity", (query) =>
      query.eq("issuer", identity.issuer).eq("subject", identity.subject),
    )
    .unique();
}

export async function writeAudit(
  ctx: MutationCtx,
  entry: {
    agencyId: Id<"agencies">;
    actorUserId: Id<"users">;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: string;
    operationId?: string;
  },
) {
  await ctx.db.insert("auditLogs", {
    ...entry,
    recordedAt: Date.now(),
  });
}

export async function countActiveOwners(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
) {
  const members = await ctx.db
    .query("agencyMembers")
    .withIndex("by_agency_status", (query) =>
      query.eq("agencyId", agencyId).eq("status", "active"),
    )
    .take(1000);
  return members.filter((member) => member.roleKey === "AGENCY_OWNER").length;
}
