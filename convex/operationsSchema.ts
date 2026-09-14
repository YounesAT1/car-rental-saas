import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  guardFields,
  issueFields,
  allocationFields,
  mileageFields,
  taskFields,
  vendorFields,
  scheduleFields,
  maintenanceFields,
  expenseFields,
  templateFields,
  inspectionFields,
  damageFields,
  documentTypeFields,
  vehicleDocumentFields,
  privateFileFields,
  uploadFields,
} from "./lib/operationsValidators";

export const operationsTables = {
  operationsMigrations: defineTable({
    agencyId: v.id("agencies"),
    complete: v.boolean(),
    cursor: v.union(v.string(), v.null()),
  }).index("by_agency", ["agencyId"]),
  vehicleAvailabilityStates: defineTable(guardFields)
    .index("by_agency_vehicle", ["agencyId", "vehicleId"])
    .index("by_agency_readiness", ["agencyId", "readiness"]),
  vehicleReadinessIssues: defineTable(issueFields)
    .index("by_agency_vehicle_active", ["agencyId", "vehicleId", "active"])
    .index("by_agency_source", ["agencyId", "vehicleId", "sourceKey"]),
  vehicleAllocations: defineTable(allocationFields)
    .index("by_agency_vehicle_blocking_end", [
      "agencyId",
      "vehicleId",
      "blocking",
      "endAt",
    ])
    .index("by_agency_vehicle_blocking_start", [
      "agencyId",
      "vehicleId",
      "blocking",
      "startAt",
    ])
    .index("by_agency_source", ["agencyId", "sourceKey"]),
  vehicleMileageLogs: defineTable(mileageFields)
    .index("by_agency_vehicle_observed", [
      "agencyId",
      "vehicleId",
      "observedAt",
    ])
    .index("by_agency_vehicle_active_observed", [
      "agencyId",
      "vehicleId",
      "active",
      "observedAt",
    ]),
  operationalTasks: defineTable(taskFields)
    .index("by_agency_status_due", ["agencyId", "status", "dueAt"])
    .index("by_agency_assignee_status", ["agencyId", "assigneeId", "status"])
    .index("by_agency_source", ["agencyId", "sourceKey"]),
  maintenanceVendors: defineTable(vendorFields).index("by_agency_active", [
    "agencyId",
    "active",
  ]),
  maintenanceSchedules: defineTable(scheduleFields)
    .index("by_agency_active_due", ["agencyId", "active", "nextDueAt"])
    .index("by_agency_vehicle_active", ["agencyId", "vehicleId", "active"]),
  maintenanceRecords: defineTable(maintenanceFields)
    .index("by_agency_status_time", ["agencyId", "status", "recordedAt"])
    .index("by_agency_vehicle_time", ["agencyId", "vehicleId", "recordedAt"])
    .index("by_agency_vehicle_status", ["agencyId", "vehicleId", "status"]),
  expenses: defineTable(expenseFields)
    .index("by_agency_source", ["agencyId", "sourceKey"])
    .index("by_agency_maintenance", ["agencyId", "maintenanceId"])
    .index("by_agency_date", ["agencyId", "incurredAt"]),
  inspectionTemplates: defineTable(templateFields)
    .index("by_agency_active", ["agencyId", "active"])
    .index("by_agency_code_version", ["agencyId", "code", "version"]),
  vehicleInspections: defineTable(inspectionFields)
    .index("by_agency_status_time", ["agencyId", "status", "recordedAt"])
    .index("by_agency_vehicle_time", ["agencyId", "vehicleId", "recordedAt"])
    .index("by_amends", ["amendsId"]),
  damageReports: defineTable(damageFields)
    .index("by_agency_status_time", ["agencyId", "status", "recordedAt"])
    .index("by_agency_vehicle_time", ["agencyId", "vehicleId", "recordedAt"])
    .index("by_agency_inspection", ["agencyId", "inspectionId"]),
  vehicleDocumentTypes: defineTable(documentTypeFields)
    .index("by_agency_code", ["agencyId", "code"])
    .index("by_agency_active", ["agencyId", "active"]),
  vehicleDocuments: defineTable(vehicleDocumentFields)
    .index("by_agency_vehicle_type_status", [
      "agencyId",
      "vehicleId",
      "typeId",
      "status",
    ])
    .index("by_agency_vehicle_time", ["agencyId", "vehicleId", "recordedAt"])
    .index("by_agency_status_expiry", ["agencyId", "status", "expiresAt"]),
  files: defineTable(privateFileFields)
    .index("by_agency_owner", ["agencyId", "ownerKey"])
    .index("by_agency", ["agencyId"])
    .index("by_intent", ["intentId"]),
  privateUploadIntents: defineTable(uploadFields)
    .index("by_agency_actor", ["agencyId", "actorId", "status"])
    .index("by_status_expiry", ["status", "expiresAt"])
    .index("by_agency_owner", ["agencyId", "ownerKey"]),
  privateFilePages: defineTable({
    agencyId: v.id("agencies"),
    intentId: v.id("privateUploadIntents"),
    fileId: v.optional(v.id("files")),
    position: v.number(),
    storageId: v.id("_storage"),
    bytes: v.number(),
  })
    .index("by_intent", ["intentId"])
    .index("by_file_position", ["fileId", "position"])
    .index("by_storage", ["storageId"]),
  privateFileBlobs: defineTable({
    agencyId: v.id("agencies"),
    intentId: v.id("privateUploadIntents"),
    hash: v.string(),
    kind: v.union(v.literal("source"), v.literal("page")),
    position: v.optional(v.number()),
    storageId: v.optional(v.id("_storage")),
    state: v.union(
      v.literal("registered"),
      v.literal("stored"),
      v.literal("linked"),
    ),
  })
    .index("by_intent", ["intentId"])
    .index("by_hash", ["hash"])
    .index("by_storage", ["storageId"]),
  privateFileUsage: defineTable({
    agencyId: v.id("agencies"),
    bytes: v.number(),
    reservedBytes: v.number(),
  }).index("by_agency", ["agencyId"]),
};
