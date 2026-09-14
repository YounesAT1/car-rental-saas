import { v, type PropertyValidators } from "convex/values";
import { labels } from "./fleetValidators";

export const documentValidator = <
  T extends string,
  F extends PropertyValidators,
>(
  table: T,
  fields: F,
) => v.object({ ...fields, _id: v.id(table), _creationTime: v.number() });
export const operationBase = {
  agencyId: v.id("agencies"),
  revision: v.number(),
  recordedAt: v.number(),
  actorId: v.id("users"),
};
export const unit = v.union(v.literal("km"), v.literal("mi"));
export const taskStatus = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("done"),
  v.literal("cancelled"),
);
export const severity = v.union(v.literal("notice"), v.literal("blocking"));
export const source = v.union(
  v.object({ kind: v.literal("manual"), key: v.string() }),
  v.object({ kind: v.literal("initial"), vehicleId: v.id("vehicles") }),
  v.object({ kind: v.literal("maintenance"), id: v.id("maintenanceRecords") }),
  v.object({ kind: v.literal("schedule"), id: v.id("maintenanceSchedules") }),
  v.object({ kind: v.literal("inspection"), id: v.id("vehicleInspections") }),
  v.object({ kind: v.literal("damage"), id: v.id("damageReports") }),
  v.object({ kind: v.literal("document"), id: v.id("vehicleDocumentTypes") }),
);
export const guardFields = {
  agencyId: v.id("agencies"),
  vehicleId: v.id("vehicles"),
  revision: v.number(),
  readiness: v.union(
    v.literal("needs_review"),
    v.literal("blocked"),
    v.literal("ready"),
  ),
  verified: v.boolean(),
  complianceRevision: v.number(),
  complianceUntil: v.optional(v.number()),
  latestMileageId: v.optional(v.id("vehicleMileageLogs")),
  mileageMeters: v.optional(v.number()),
  mileageObservedAt: v.optional(v.number()),
  odometerOffset: v.number(),
  epochStartedAt: v.number(),
};
export const issueFields = {
  ...operationBase,
  vehicleId: v.id("vehicles"),
  source,
  sourceKey: v.string(),
  severity,
  reason: v.string(),
  active: v.boolean(),
  resolvedAt: v.optional(v.number()),
  resolution: v.optional(v.string()),
  resolvedBy: v.optional(v.id("users")),
};
export const allocationFields = {
  ...operationBase,
  vehicleId: v.id("vehicles"),
  branchId: v.id("branches"),
  source,
  sourceKey: v.string(),
  kind: v.union(
    v.literal("maintenance"),
    v.literal("inspection"),
    v.literal("manual"),
  ),
  startAt: v.number(),
  endAt: v.number(),
  blocking: v.boolean(),
  reason: v.string(),
};
export const mileageFields = {
  ...operationBase,
  vehicleId: v.id("vehicles"),
  value: v.number(),
  unit,
  meters: v.number(),
  offset: v.number(),
  observedAt: v.number(),
  active: v.boolean(),
  kind: v.union(
    v.literal("observation"),
    v.literal("correction"),
    v.literal("replacement"),
  ),
  reason: v.string(),
  source,
  supersedesId: v.optional(v.id("vehicleMileageLogs")),
};
export const taskFields = {
  ...operationBase,
  vehicleId: v.optional(v.id("vehicles")),
  title: v.string(),
  description: v.string(),
  assigneeId: v.optional(v.id("users")),
  dueAt: v.optional(v.number()),
  status: taskStatus,
  priority: v.union(
    v.literal("normal"),
    v.literal("high"),
    v.literal("urgent"),
  ),
  source,
  sourceKey: v.string(),
  automatic: v.boolean(),
};
export const vendorFields = {
  ...operationBase,
  name: v.string(),
  phone: v.string(),
  email: v.string(),
  address: v.string(),
  active: v.boolean(),
};
export const scheduleFields = {
  ...operationBase,
  vehicleId: v.id("vehicles"),
  service: v.string(),
  days: v.optional(v.number()),
  meters: v.optional(v.number()),
  baselineAt: v.optional(v.number()),
  baselineMeters: v.optional(v.number()),
  mileageId: v.optional(v.id("vehicleMileageLogs")),
  baselineValid: v.boolean(),
  nextDueAt: v.optional(v.number()),
  nextDueMeters: v.optional(v.number()),
  timezone: v.string(),
  active: v.boolean(),
  lastRecordId: v.optional(v.id("maintenanceRecords")),
};
export const costLine = v.object({
  description: v.string(),
  amountMinor: v.number(),
  kind: v.union(v.literal("parts"), v.literal("labor"), v.literal("other")),
});
export const maintenanceStatus = v.union(
  v.literal("planned"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
);
export const maintenanceFields = {
  ...operationBase,
  vehicleId: v.id("vehicles"),
  vendorId: v.optional(v.id("maintenanceVendors")),
  title: v.string(),
  findings: v.string(),
  status: maintenanceStatus,
  emergency: v.boolean(),
  startAt: v.optional(v.number()),
  endAt: v.optional(v.number()),
  actualStartAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  scheduleIds: v.array(v.id("maintenanceSchedules")),
  mileageId: v.optional(v.id("vehicleMileageLogs")),
  currency: v.string(),
  costLines: v.array(costLine),
  readinessConfirmed: v.boolean(),
  expenseRevision: v.number(),
};
export const expenseFields = {
  ...operationBase,
  vehicleId: v.id("vehicles"),
  maintenanceId: v.id("maintenanceRecords"),
  sourceKey: v.string(),
  amountMinor: v.number(),
  currency: v.string(),
  description: v.string(),
  incurredAt: v.number(),
  reversesId: v.optional(v.id("expenses")),
};
export const templateItem = v.object({
  code: v.string(),
  labels,
  safety: v.boolean(),
  required: v.boolean(),
});
export const templateFields = {
  ...operationBase,
  code: v.string(),
  name: labels,
  version: v.number(),
  active: v.boolean(),
  items: v.array(templateItem),
};
export const inspectionItem = v.object({
  ...templateItem.fields,
  result: v.union(
    v.literal("unchecked"),
    v.literal("pass"),
    v.literal("fail"),
    v.literal("not_applicable"),
  ),
  notes: v.string(),
});
export const inspectionFields = {
  ...operationBase,
  vehicleId: v.id("vehicles"),
  templateId: v.id("inspectionTemplates"),
  templateVersion: v.number(),
  templateName: labels,
  type: v.union(
    v.literal("initial"),
    v.literal("routine"),
    v.literal("post_repair"),
  ),
  status: v.union(
    v.literal("draft"),
    v.literal("completed"),
    v.literal("cancelled"),
  ),
  items: v.array(inspectionItem),
  notes: v.string(),
  fuelPercent: v.number(),
  startAt: v.optional(v.number()),
  endAt: v.optional(v.number()),
  mileageId: v.optional(v.id("vehicleMileageLogs")),
  completedAt: v.optional(v.number()),
  acknowledgment: v.boolean(),
  amendsId: v.optional(v.id("vehicleInspections")),
  amendmentReason: v.string(),
};
export const damageStatus = v.union(
  v.literal("reported"),
  v.literal("reviewing"),
  v.literal("approved"),
  v.literal("repairing"),
  v.literal("resolved"),
);
export const damageFields = {
  ...operationBase,
  vehicleId: v.id("vehicles"),
  inspectionId: v.id("vehicleInspections"),
  location: v.string(),
  description: v.string(),
  severity,
  status: damageStatus,
  responsibility: v.union(
    v.literal("unknown"),
    v.literal("agency"),
    v.literal("third_party"),
  ),
  disputed: v.boolean(),
  resolution: v.string(),
  resolvedAt: v.optional(v.number()),
  estimateMinor: v.optional(v.number()),
  currency: v.string(),
};
export const documentTypeFields = {
  ...operationBase,
  code: v.string(),
  labels,
  required: v.boolean(),
  expiryRequired: v.boolean(),
  active: v.boolean(),
};
export const vehicleDocumentFields = {
  ...operationBase,
  vehicleId: v.id("vehicles"),
  typeId: v.id("vehicleDocumentTypes"),
  number: v.string(),
  issuer: v.string(),
  issuedDate: v.string(),
  expiryDate: v.string(),
  expiresAt: v.optional(v.number()),
  timezone: v.string(),
  fileId: v.optional(v.id("files")),
  status: v.union(
    v.literal("draft"),
    v.literal("current"),
    v.literal("superseded"),
  ),
  supersedesId: v.optional(v.id("vehicleDocuments")),
};
export const fileOwner = v.union(
  v.object({ kind: v.literal("document"), id: v.id("vehicleDocuments") }),
  v.object({ kind: v.literal("maintenance"), id: v.id("maintenanceRecords") }),
  v.object({ kind: v.literal("inspection"), id: v.id("vehicleInspections") }),
  v.object({ kind: v.literal("damage"), id: v.id("damageReports") }),
);
export const privateFileFields = {
  agencyId: v.id("agencies"),
  vehicleId: v.id("vehicles"),
  owner: fileOwner,
  ownerKey: v.string(),
  actorId: v.id("users"),
  intentId: v.id("privateUploadIntents"),
  recordedAt: v.number(),
  pageCount: v.number(),
  bytes: v.number(),
  sourceHash: v.string(),
};
export const uploadFields = {
  agencyId: v.id("agencies"),
  vehicleId: v.id("vehicles"),
  actorId: v.id("users"),
  owner: fileOwner,
  ownerKey: v.string(),
  expectedRevision: v.number(),
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("done"),
    v.literal("failed"),
  ),
  expiresAt: v.number(),
  reservedBytes: v.number(),
  sourceStorageId: v.optional(v.id("_storage")),
  fileId: v.optional(v.id("files")),
  sourceHash: v.optional(v.string()),
  registeredHashes: v.array(v.string()),
};

export const guardDoc = documentValidator(
  "vehicleAvailabilityStates",
  guardFields,
);
export const issueDoc = documentValidator(
  "vehicleReadinessIssues",
  issueFields,
);
export const allocationDoc = documentValidator(
  "vehicleAllocations",
  allocationFields,
);
export const mileageDoc = documentValidator(
  "vehicleMileageLogs",
  mileageFields,
);
export const taskDoc = documentValidator("operationalTasks", taskFields);
export const vendorDoc = documentValidator("maintenanceVendors", vendorFields);
export const scheduleDoc = documentValidator(
  "maintenanceSchedules",
  scheduleFields,
);
export const maintenanceDoc = documentValidator(
  "maintenanceRecords",
  maintenanceFields,
);
export const expenseDoc = documentValidator("expenses", expenseFields);
export const templateDoc = documentValidator(
  "inspectionTemplates",
  templateFields,
);
export const inspectionDoc = documentValidator(
  "vehicleInspections",
  inspectionFields,
);
export const damageDoc = documentValidator("damageReports", damageFields);
export const documentTypeDoc = documentValidator(
  "vehicleDocumentTypes",
  documentTypeFields,
);
export const vehicleDocumentDoc = documentValidator(
  "vehicleDocuments",
  vehicleDocumentFields,
);
