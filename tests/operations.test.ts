import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { defaultHours } from "../src/lib/agency-settings";
import {
  costTotal,
  distanceMeters,
  dueState,
  maintenanceTransitionAllowed,
  overlaps,
} from "../src/lib/operations";

const modules = {
  "../convex/_generated/server.js": () => import("../convex/_generated/server"),
  "../convex/maintenance.ts": () => import("../convex/maintenance"),
};

const maintenance = {
  schedules: makeFunctionReference<"query">("maintenance:schedules"),
  saveSchedule: makeFunctionReference<"mutation">("maintenance:saveSchedule"),
  save: makeFunctionReference<"mutation">("maintenance:save"),
  start: makeFunctionReference<"mutation">("maintenance:start"),
  complete: makeFunctionReference<"mutation">("maintenance:complete"),
  correctCost: makeFunctionReference<"mutation">("maintenance:correctCost"),
  get: makeFunctionReference<"query">("maintenance:get"),
};

async function fixture() {
  const t = convexTest(schema, modules);
  const issuer = "https://test.clerk.accounts.dev";
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      issuer,
      subject: "owner",
      name: "Owner",
      status: "active",
      identityUpdatedAt: now,
    });
    const readerId = await ctx.db.insert("users", {
      issuer,
      subject: "reader",
      name: "Reader",
      status: "active",
      identityUpdatedAt: now,
    });
    const agencyId = await ctx.db.insert("agencies", {
      name: "Atlas",
      slug: "atlas-operations",
      status: "active",
      timezone: "Africa/Casablanca",
      currency: "MAD",
      policyVersion: 1,
      createdByUserId: ownerId,
      complianceRevision: 0,
    });
    await ctx.db.insert("agencyMembers", {
      agencyId,
      userId: ownerId,
      roleKey: "AGENCY_OWNER",
      status: "active",
      branchScope: "all",
      joinedAt: now,
      revision: 1,
    });
    await ctx.db.insert("agencyMembers", {
      agencyId,
      userId: readerId,
      roleKey: "READ_ONLY",
      status: "active",
      branchScope: "all",
      joinedAt: now,
      revision: 1,
    });
    const branchId = await ctx.db.insert("branches", {
      agencyId,
      name: "Airport",
      code: "CMN",
      address: "Terminal 1",
      city: "Casablanca",
      postalCode: "",
      country: "MA",
      timezone: "Africa/Casablanca",
      phone: "",
      contactEmail: "",
      hours: defaultHours(),
      closures: [],
      status: "active",
      revision: 1,
      updatedAt: now,
      createdByUserId: ownerId,
    });
    const categoryId = await ctx.db.insert("fleetCatalogs", {
      agencyId,
      kind: "category",
      code: "ECO",
      labels: { en: "Economy", fr: "Économique", ar: "اقتصادية" },
      publicVisible: true,
      lifecycle: "active",
      revision: 1,
    });
    const vehicleId = await ctx.db.insert("vehicles", {
      agencyId,
      fleetNumber: "AT-001",
      fleetNormalized: "AT-001",
      plate: "12345-A-6",
      plateNormalized: "12345-A-6",
      vin: "",
      vinNormalized: "",
      make: "Dacia",
      model: "Sandero",
      trim: "Stepway",
      year: 2025,
      color: "Blue",
      transmission: "manual",
      fuel: "diesel",
      seats: 5,
      doors: 5,
      branchId,
      categoryId,
      featureIds: [],
      description: "",
      notes: "",
      lifecycle: "active",
      publicVisible: false,
      revision: 1,
      updatedAt: now,
      searchText: "AT-001 Dacia Sandero",
    });
    await ctx.db.insert("vehicleAvailabilityStates", {
      agencyId,
      vehicleId,
      revision: 1,
      readiness: "needs_review",
      verified: false,
      complianceRevision: 0,
      odometerOffset: 0,
      epochStartedAt: 0,
    });
    await ctx.db.insert("operationsMigrations", {
      agencyId,
      complete: true,
      cursor: null,
    });
    return { agencyId, ownerId, readerId, vehicleId };
  });
  return {
    t,
    owner: t.withIdentity({ issuer, subject: "owner" }),
    reader: t.withIdentity({ issuer, subject: "reader" }),
    ...ids,
  };
}

describe("vehicle operations rules", () => {
  test("uses exact distance, overlap, due-state and transition rules", () => {
    expect(distanceMeters(1, "mi")).toBe(1609);
    expect(overlaps({ startAt: 1, endAt: 2 }, { startAt: 2, endAt: 3 })).toBe(
      false,
    );
    expect(overlaps({ startAt: 1, endAt: 4 }, { startAt: 2, endAt: 3 })).toBe(
      true,
    );
    expect(
      dueState({ days: 30, baselineValid: false }, undefined, Date.now()),
    ).toBe("unknown");
    expect(maintenanceTransitionAllowed("planned", "in_progress")).toBe(true);
    expect(maintenanceTransitionAllowed("planned", "completed")).toBe(false);
    expect(costTotal([{ amountMinor: 100 }, { amountMinor: 250 }])).toBe(350);
    expect(() => costTotal([{ amountMinor: -1 }])).toThrow(
      "OPERATIONS_INVALID",
    );
  });

  test("completes maintenance atomically and resets linked schedules", async () => {
    const f = await fixture();
    const scheduleId = (await f.owner.mutation(maintenance.saveSchedule, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      expectedRevision: 0,
      service: "Oil service",
      days: 180,
      meters: 10_000_000,
      active: true,
      requestKey: "schedule-001",
    })) as Id<"maintenanceSchedules">;
    const startAt = Date.now() + 60_000;
    const recordId = (await f.owner.mutation(maintenance.save, {
      agencyId: f.agencyId,
      expectedRevision: 0,
      vehicleId: f.vehicleId,
      title: "Oil and filter service",
      findings: "",
      startAt,
      endAt: startAt + 3_600_000,
      scheduleIds: [scheduleId],
      costLines: [],
      expectedCurrency: "MAD",
      requestKey: "maint-save-001",
    })) as Id<"maintenanceRecords">;
    expect(
      await f.owner.mutation(maintenance.save, {
        agencyId: f.agencyId,
        expectedRevision: 0,
        vehicleId: f.vehicleId,
        title: "Oil and filter service",
        findings: "",
        startAt,
        endAt: startAt + 3_600_000,
        scheduleIds: [scheduleId],
        costLines: [],
        expectedCurrency: "MAD",
        requestKey: "maint-save-001",
      }),
    ).toBe(recordId);
    await f.owner.mutation(maintenance.start, {
      agencyId: f.agencyId,
      id: recordId,
      expectedRevision: 1,
      requestKey: "maint-start-001",
    });
    await f.owner.mutation(maintenance.complete, {
      agencyId: f.agencyId,
      id: recordId,
      expectedRevision: 2,
      findings: "Oil and filter replaced",
      mileage: { value: 42_000, unit: "km", observedAt: Date.now() },
      costLines: [
        { kind: "parts", description: "Oil and filter", amountMinor: 80000 },
        { kind: "labor", description: "Workshop labor", amountMinor: 20000 },
      ],
      expectedCurrency: "MAD",
      readinessConfirmed: true,
      requestKey: "maint-done-001",
    });
    const state = await f.t.run(async (ctx) => {
      const record = await ctx.db.get(recordId);
      const schedule = await ctx.db.get(scheduleId);
      const allocation = await ctx.db
        .query("vehicleAllocations")
        .withIndex("by_agency_source", (q) =>
          q
            .eq("agencyId", f.agencyId)
            .eq("sourceKey", `maintenance:${recordId}`),
        )
        .unique();
      const issue = await ctx.db
        .query("vehicleReadinessIssues")
        .withIndex("by_agency_source", (q) =>
          q
            .eq("agencyId", f.agencyId)
            .eq("vehicleId", f.vehicleId)
            .eq("sourceKey", `maintenance:${recordId}`),
        )
        .unique();
      const expenses = await ctx.db
        .query("expenses")
        .withIndex("by_agency_maintenance", (q) =>
          q.eq("agencyId", f.agencyId).eq("maintenanceId", recordId),
        )
        .collect();
      return { record, schedule, allocation, issue, expenses };
    });
    expect(state.record?.status).toBe("completed");
    expect(state.record?.mileageId).toBeDefined();
    expect(state.schedule?.baselineValid).toBe(true);
    expect(state.schedule?.baselineMeters).toBe(42_000_000);
    expect(state.schedule?.lastRecordId).toBe(recordId);
    expect(state.allocation?.blocking).toBe(false);
    expect(state.issue?.active).toBe(false);
    expect(state.expenses.map((expense) => expense.amountMinor)).toEqual([
      100000,
    ]);
  });

  test("blocks overlap, redacts costs, and appends cost corrections", async () => {
    const f = await fixture();
    const startAt = Date.now() + 120_000;
    const recordId = (await f.owner.mutation(maintenance.save, {
      agencyId: f.agencyId,
      expectedRevision: 0,
      vehicleId: f.vehicleId,
      title: "Brake service",
      findings: "",
      startAt,
      endAt: startAt + 3_600_000,
      scheduleIds: [],
      costLines: [],
      expectedCurrency: "MAD",
      requestKey: "maint-save-002",
    })) as Id<"maintenanceRecords">;
    await expect(
      f.owner.mutation(maintenance.save, {
        agencyId: f.agencyId,
        expectedRevision: 0,
        vehicleId: f.vehicleId,
        title: "Conflicting service",
        findings: "",
        startAt: startAt + 1000,
        endAt: startAt + 7200000,
        scheduleIds: [],
        costLines: [],
        expectedCurrency: "MAD",
        requestKey: "maint-save-003",
      }),
    ).rejects.toThrow("ALLOCATION_CONFLICT");
    await f.owner.mutation(maintenance.start, {
      agencyId: f.agencyId,
      id: recordId,
      expectedRevision: 1,
      requestKey: "maint-start-002",
    });
    await f.owner.mutation(maintenance.complete, {
      agencyId: f.agencyId,
      id: recordId,
      expectedRevision: 2,
      findings: "Completed",
      costLines: [
        { kind: "parts", description: "Brake pads", amountMinor: 120000 },
      ],
      expectedCurrency: "MAD",
      readinessConfirmed: true,
      requestKey: "maint-done-002",
    });
    const ownerView = await f.owner.query(maintenance.get, {
      agencyId: f.agencyId,
      id: recordId,
    });
    const readerView = await f.reader.query(maintenance.get, {
      agencyId: f.agencyId,
      id: recordId,
    });
    expect(ownerView?.record.costLines).toHaveLength(1);
    expect(ownerView?.expenses).toHaveLength(1);
    expect(readerView?.record.costLines).toBeNull();
    expect(readerView?.expenses).toBeNull();
    await f.owner.mutation(maintenance.correctCost, {
      agencyId: f.agencyId,
      id: recordId,
      expectedRevision: 3,
      replacementLines: [
        { kind: "parts", description: "Corrected pads", amountMinor: 90000 },
      ],
      expectedCurrency: "MAD",
      reason: "Supplier credit applied",
      requestKey: "maint-cost-002",
    });
    const corrected = await f.owner.query(maintenance.get, {
      agencyId: f.agencyId,
      id: recordId,
    });
    expect(
      corrected?.expenses?.map(
        (expense: { amountMinor: number }) => expense.amountMinor,
      ),
    ).toEqual([120000, -120000, 90000]);
    await expect(
      f.reader.mutation(maintenance.correctCost, {
        agencyId: f.agencyId,
        id: recordId,
        expectedRevision: 4,
        replacementLines: [],
        expectedCurrency: "MAD",
        reason: "Not allowed",
        requestKey: "maint-cost-003",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  });
});
