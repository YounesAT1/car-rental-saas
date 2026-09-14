import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { operationsTables } from "./operationsSchema";
import {
  branchFields,
  branchStatus,
  policyFields,
} from "./lib/settingsValidators";

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

import {
  catalogFields,
  catalogKind,
  lifecycle,
  vehicleFields,
  labels,
} from "./lib/fleetValidators";

export default defineSchema({
  ...operationsTables,
  fleetCatalogs: defineTable({
    ...catalogFields,
    agencyId: v.id("agencies"),
    kind: catalogKind,
    lifecycle,
    revision: v.number(),
  }).index("by_agency_kind_code", ["agencyId", "kind", "code"]),
  vehicles: defineTable({
    ...vehicleFields,
    agencyId: v.id("agencies"),
    lifecycle,
    fleetNormalized: v.string(),
    plateNormalized: v.string(),
    vinNormalized: v.string(),
    publicVisible: v.boolean(),
    revision: v.number(),
    updatedAt: v.number(),
    searchText: v.string(),
    acquisitionCost: v.optional(
      v.object({ amountMinor: v.number(), currency: v.string() }),
    ),
  })
    .index("by_agency_fleet", ["agencyId", "fleetNormalized"])
    .index("by_agency_plate", ["agencyId", "plateNormalized"])
    .index("by_agency_vin", ["agencyId", "vinNormalized"])
    .index("by_agency_lifecycle", ["agencyId", "lifecycle"])
    .index("by_agency_branch", ["agencyId", "branchId", "lifecycle"])
    .index("by_agency_category", ["agencyId", "categoryId", "lifecycle"])
    .index("by_agency_branch_category", [
      "agencyId",
      "branchId",
      "categoryId",
      "lifecycle",
    ])
    .searchIndex("search_fleet", {
      searchField: "searchText",
      filterFields: ["agencyId", "lifecycle", "branchId", "categoryId"],
    }),
  fleetUsage: defineTable({
    agencyId: v.id("agencies"),
    vehicles: v.number(),
    bytes: v.number(),
    reservedBytes: v.number(),
  }).index("by_agency", ["agencyId"]),
  vehicleImages: defineTable({
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    fileId: v.id("fleetFiles"),
    position: v.number(),
    alt: labels,
  }).index("by_agency_vehicle", ["agencyId", "vehicleId", "position"]),
  fleetFiles: defineTable({
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    storageId: v.id("_storage"),
    bytes: v.number(),
    intentId: v.id("fleetUploadIntents"),
  })
    .index("by_storage", ["storageId"])
    .index("by_agency", ["agencyId"]),
  fleetUploadIntents: defineTable({
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    actorId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    expiresAt: v.number(),
    reservedBytes: v.number(),
    processedHash: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  })
    .index("by_status_expiry", ["status", "expiresAt"])
    .index("by_agency_actor", ["agencyId", "actorId"])
    .index("by_agency_vehicle", ["agencyId", "vehicleId"])
    .index("by_hash", ["processedHash"]),
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
    complianceRevision: v.optional(v.number()),
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
    legalName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    country: v.optional(v.string()),
    defaultLocale: v.optional(
      v.union(v.literal("en"), v.literal("fr"), v.literal("ar")),
    ),
    revision: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  branches: defineTable({
    ...branchFields,
    agencyId: v.id("agencies"),
    status: branchStatus,
    revision: v.number(),
    updatedAt: v.number(),
    createdByUserId: v.id("users"),
  })
    .index("by_agency_code", ["agencyId", "code"])
    .index("by_agency_status", ["agencyId", "status"]),

  agencyPolicyVersions: defineTable({
    ...policyFields,
    agencyId: v.id("agencies"),
    version: v.number(),
    currency: v.string(),
    effectiveAt: v.number(),
    actorUserId: v.id("users"),
  })
    .index("by_agency_version", ["agencyId", "version"])
    .index("by_agency_effective", ["agencyId", "effectiveAt"]),

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
    fingerprint: v.optional(v.string()),
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
