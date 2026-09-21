import { makeFunctionReference, type PaginationResult } from "convex/server";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export type MaintenanceView = Omit<Doc<"maintenanceRecords">, "costLines"> & {
  costLines: Doc<"maintenanceRecords">["costLines"] | null;
};

export type DamageView = Omit<Doc<"damageReports">, "estimateMinor"> & {
  estimateMinor: number | null;
};

type PageArgs = { cursor: string | null; numItems: number };
export type PrivateOwner =
  | { kind: "document"; id: Id<"vehicleDocuments"> }
  | { kind: "maintenance"; id: Id<"maintenanceRecords"> }
  | { kind: "inspection"; id: Id<"vehicleInspections"> }
  | { kind: "damage"; id: Id<"damageReports"> };

export const operationsApi = {
  maintenance: {
    list: makeFunctionReference<
      "query",
      {
        agencyId: Id<"agencies">;
        status: Doc<"maintenanceRecords">["status"];
        paginationOpts: PageArgs;
      },
      PaginationResult<MaintenanceView>
    >("maintenance:list"),
    history: makeFunctionReference<
      "query",
      {
        agencyId: Id<"agencies">;
        vehicleId: Id<"vehicles">;
        paginationOpts: PageArgs;
      },
      PaginationResult<MaintenanceView>
    >("maintenance:history"),
    get: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies">; id: Id<"maintenanceRecords"> },
      { record: MaintenanceView; expenses: Doc<"expenses">[] | null } | null
    >("maintenance:get"),
    save: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id?: Id<"maintenanceRecords">;
        expectedRevision: number;
        vehicleId: Id<"vehicles">;
        vendorId?: Id<"maintenanceVendors">;
        title: string;
        findings: string;
        startAt?: number;
        endAt?: number;
        scheduleIds: Id<"maintenanceSchedules">[];
        costLines: Doc<"maintenanceRecords">["costLines"];
        expectedCurrency: string;
        requestKey: string;
      },
      Id<"maintenanceRecords">
    >("maintenance:save"),
    start: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id: Id<"maintenanceRecords">;
        expectedRevision: number;
        requestKey: string;
      },
      null
    >("maintenance:start"),
    complete: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id: Id<"maintenanceRecords">;
        expectedRevision: number;
        findings: string;
        mileage?: { value: number; unit: "km" | "mi"; observedAt: number };
        costLines: Doc<"maintenanceRecords">["costLines"];
        expectedCurrency: string;
        readinessConfirmed: boolean;
        requestKey: string;
      },
      null
    >("maintenance:complete"),
    cancel: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id: Id<"maintenanceRecords">;
        expectedRevision: number;
        reason: string;
        readinessConfirmed: boolean;
        requestKey: string;
      },
      null
    >("maintenance:cancel"),
    schedules: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies">; vehicleId: Id<"vehicles">; active: boolean },
      Doc<"maintenanceSchedules">[]
    >("maintenance:schedules"),
  },
  inspections: {
    queue: makeFunctionReference<
      "query",
      {
        agencyId: Id<"agencies">;
        status: Doc<"vehicleInspections">["status"];
        paginationOpts: PageArgs;
      },
      PaginationResult<Doc<"vehicleInspections">>
    >("inspections:queue"),
    list: makeFunctionReference<
      "query",
      {
        agencyId: Id<"agencies">;
        vehicleId: Id<"vehicles">;
        paginationOpts: PageArgs;
      },
      PaginationResult<Doc<"vehicleInspections">>
    >("inspections:list"),
    get: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies">; id: Id<"vehicleInspections"> },
      Doc<"vehicleInspections"> | null
    >("inspections:get"),
    create: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        vehicleId: Id<"vehicles">;
        templateId: Id<"inspectionTemplates">;
        type: Doc<"vehicleInspections">["type"];
        startAt?: number;
        endAt?: number;
        requestKey: string;
      },
      Id<"vehicleInspections">
    >("inspections:create"),
    save: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id: Id<"vehicleInspections">;
        expectedRevision: number;
        items: Array<{
          code: string;
          result: Doc<"vehicleInspections">["items"][number]["result"];
          notes: string;
        }>;
        notes: string;
        fuelPercent: number;
        acknowledgment: boolean;
        requestKey: string;
      },
      null
    >("inspections:save"),
    complete: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id: Id<"vehicleInspections">;
        expectedRevision: number;
        mileage?: { value: number; unit: "km" | "mi"; observedAt: number };
        requestKey: string;
      },
      null
    >("inspections:complete"),
    cancel: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id: Id<"vehicleInspections">;
        expectedRevision: number;
        reason: string;
        requestKey: string;
      },
      null
    >("inspections:cancel"),
  },
  damage: {
    list: makeFunctionReference<
      "query",
      {
        agencyId: Id<"agencies">;
        status: Doc<"damageReports">["status"];
        paginationOpts: PageArgs;
      },
      PaginationResult<DamageView>
    >("damage:list"),
    history: makeFunctionReference<
      "query",
      {
        agencyId: Id<"agencies">;
        vehicleId: Id<"vehicles">;
        paginationOpts: PageArgs;
      },
      PaginationResult<DamageView>
    >("damage:history"),
    get: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies">; id: Id<"damageReports"> },
      DamageView | null
    >("damage:get"),
    report: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        vehicleId: Id<"vehicles">;
        inspectionId: Id<"vehicleInspections">;
        location: string;
        description: string;
        severity: "notice" | "blocking";
        responsibility: "unknown" | "agency" | "third_party";
        disputed: boolean;
        estimateMinor?: number;
        expectedCurrency: string;
        requestKey: string;
      },
      Id<"damageReports">
    >("damage:report"),
    transition: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id: Id<"damageReports">;
        expectedRevision: number;
        status: Doc<"damageReports">["status"];
        resolution: string;
        requestKey: string;
      },
      null
    >("damage:transition"),
  },
  documents: {
    compliance: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies">; vehicleId: Id<"vehicles"> },
      Array<{
        type: Doc<"vehicleDocumentTypes">;
        document: Doc<"vehicleDocuments"> | null;
        state: "missing" | "processing" | "valid" | "expiring" | "expired";
      }>
    >("vehicleDocuments:compliance"),
    history: makeFunctionReference<
      "query",
      {
        agencyId: Id<"agencies">;
        vehicleId: Id<"vehicles">;
        paginationOpts: PageArgs;
      },
      PaginationResult<Doc<"vehicleDocuments">>
    >("vehicleDocuments:history"),
    saveDraft: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        vehicleId: Id<"vehicles">;
        id?: Id<"vehicleDocuments">;
        expectedRevision: number;
        typeId: Id<"vehicleDocumentTypes">;
        number: string;
        issuer: string;
        issuedDate: string;
        expiryDate: string;
        requestKey: string;
      },
      Id<"vehicleDocuments">
    >("vehicleDocuments:saveDraft"),
  },
  catalogs: {
    documentTypes: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies"> },
      Doc<"vehicleDocumentTypes">[]
    >("operationCatalogs:documentTypes"),
    saveDocumentType: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id?: Id<"vehicleDocumentTypes">;
        expectedRevision: number;
        code: string;
        labels: { en: string; fr: string; ar: string };
        required: boolean;
        expiryRequired: boolean;
        active: boolean;
        requestKey: string;
      },
      Id<"vehicleDocumentTypes">
    >("operationCatalogs:saveDocumentType"),
    templates: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies"> },
      Doc<"inspectionTemplates">[]
    >("operationCatalogs:templates"),
    saveTemplate: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id?: Id<"inspectionTemplates">;
        expectedRevision: number;
        code: string;
        name: { en: string; fr: string; ar: string };
        items: Array<{
          code: string;
          labels: { en: string; fr: string; ar: string };
          safety: boolean;
          required: boolean;
        }>;
        active: boolean;
        requestKey: string;
      },
      Id<"inspectionTemplates">
    >("operationCatalogs:saveTemplate"),
    vendors: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies"> },
      Doc<"maintenanceVendors">[]
    >("operationCatalogs:vendors"),
    saveVendor: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        id?: Id<"maintenanceVendors">;
        expectedRevision: number;
        name: string;
        phone: string;
        email: string;
        address: string;
        active: boolean;
        requestKey: string;
      },
      Id<"maintenanceVendors">
    >("operationCatalogs:saveVendor"),
    vehicles: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies"> },
      Array<{ id: Id<"vehicles">; label: string; active: boolean }>
    >("operationCatalogs:vehicles"),
  },
  privateFiles: {
    begin: makeFunctionReference<
      "mutation",
      {
        agencyId: Id<"agencies">;
        vehicleId: Id<"vehicles">;
        owner: PrivateOwner;
        expectedRevision: number;
      },
      Id<"privateUploadIntents">
    >("privateFiles:begin"),
    list: makeFunctionReference<
      "query",
      {
        agencyId: Id<"agencies">;
        vehicleId: Id<"vehicles">;
        owner: PrivateOwner;
      },
      Array<{
        id: Id<"files">;
        recordedAt: number;
        pageCount: number;
        bytes: number;
      }>
    >("privateFiles:list"),
    status: makeFunctionReference<
      "query",
      { intentId: Id<"privateUploadIntents"> },
      {
        status: "pending" | "processing" | "done" | "failed";
        fileId: Id<"files"> | null;
      } | null
    >("privateFiles:status"),
    manifest: makeFunctionReference<
      "query",
      { agencyId: Id<"agencies">; fileId: Id<"files"> },
      Array<{
        id: Id<"privateFilePages">;
        position: number;
        bytes: number;
      }> | null
    >("privateFiles:manifest"),
  },
} as const;
