import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const roleKey = v.union(
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

export default defineSchema({
  users: defineTable({
    issuer: v.string(),
    subject: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("disabled")),
    identityUpdatedAt: v.number(),
    locale: v.optional(
      v.union(v.literal("en"), v.literal("fr"), v.literal("ar")),
    ),
  }).index("by_identity", ["issuer", "subject"]),

  agencies: defineTable({
    name: v.string(),
    slug: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("archived"),
    ),
    timezone: v.string(),
    currency: v.string(),
    policyVersion: v.number(),
    createdByUserId: v.id("users"),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  agencyMembers: defineTable({
    agencyId: v.id("agencies"),
    userId: v.id("users"),
    roleKey,
    status: v.union(
      v.literal("active"),
      v.literal("revoked"),
      v.literal("suspended"),
    ),
    branchScope: v.literal("all"),
    joinedAt: v.number(),
    revision: v.number(),
  })
    .index("by_agency_user", ["agencyId", "userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_agency_role_status", ["agencyId", "roleKey", "status"])
    .index("by_agency_status", ["agencyId", "status"]),

  agencyInvitations: defineTable({
    agencyId: v.id("agencies"),
    emailNormalized: v.string(),
    roleKey,
    branchScope: v.literal("all"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    inviterUserId: v.id("users"),
    acceptedUserId: v.optional(v.id("users")),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenHash"])
    .index("by_agency_email_status", ["agencyId", "emailNormalized", "status"])
    .index("by_agency_status_expiry", ["agencyId", "status", "expiresAt"]),

  userPreferences: defineTable({
    userId: v.id("users"),
    lastAgencyId: v.optional(v.id("agencies")),
    locale: v.optional(
      v.union(v.literal("en"), v.literal("fr"), v.literal("ar")),
    ),
  }).index("by_user", ["userId"]),

  auditLogs: defineTable({
    agencyId: v.id("agencies"),
    actorUserId: v.id("users"),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    metadata: v.optional(v.string()),
    operationId: v.optional(v.string()),
    recordedAt: v.number(),
  })
    .index("by_agency_time", ["agencyId", "recordedAt"])
    .index("by_agency_target_time", [
      "agencyId",
      "targetType",
      "targetId",
      "recordedAt",
    ]),

  commandReceipts: defineTable({
    agencyId: v.id("agencies"),
    principalKey: v.string(),
    operation: v.string(),
    key: v.string(),
    resultRef: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_command", ["agencyId", "principalKey", "operation", "key"])
    .index("by_expiry", ["expiresAt"]),
});
