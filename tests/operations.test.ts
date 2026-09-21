import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, test, vi } from "vitest";
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
  "../convex/operations.ts": () => import("../convex/operations"),
  "../convex/operationCatalogs.ts": () => import("../convex/operationCatalogs"),
  "../convex/inspections.ts": () => import("../convex/inspections"),
};

const operations = {
  migrateAgency: makeFunctionReference<"mutation">("operations:migrateAgency"),
  sweep: makeFunctionReference<"mutation">("operations:sweep"),
};

const maintenance = {
  schedules: makeFunctionReference<"query">("maintenance:schedules"),
  listSchedules: makeFunctionReference<"query">("maintenance:listSchedules"),
  getSchedule: makeFunctionReference<"query">("maintenance:getSchedule"),
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
  test("template archive/restore applies only to the latest definition and preserves inspection snapshots", async () => {
    const f = await fixture();
    const saveTemplate = makeFunctionReference<"mutation">(
      "operationCatalogs:saveTemplate",
    );
    const setActive = makeFunctionReference<"mutation">(
      "operationCatalogs:setTemplateActive",
    );
    const history = makeFunctionReference<"query">(
      "operationCatalogs:templateHistory",
    );
    const getTemplate = makeFunctionReference<"query">(
      "operationCatalogs:getTemplate",
    );
    const template = {
      agencyId: f.agencyId,
      expectedRevision: 0,
      code: "CUSTOM",
      name: { en: "Custom", fr: "Personnalisé", ar: "مخصص" },
      items: [
        {
          code: "TYRES",
          labels: { en: "Tyres", fr: "Pneus", ar: "إطارات" },
          safety: true,
          required: false,
        },
      ],
      active: true,
      requestKey: "template-create-one",
    };
    const firstId = await f.owner.mutation(saveTemplate, template);
    expect(await f.owner.mutation(saveTemplate, template)).toBe(firstId);
    await expect(
      f.owner.mutation(saveTemplate, {
        ...template,
        name: { ...template.name, en: "Changed payload" },
      }),
    ).rejects.toThrow("REQUEST_KEY_REUSED");
    const first = await f.owner.query(getTemplate, {
      agencyId: f.agencyId,
      id: firstId,
    });
    expect(first.items[0].required).toBe(true);
    const inspectionId = await f.owner.mutation(
      makeFunctionReference<"mutation">("inspections:create"),
      {
        agencyId: f.agencyId,
        vehicleId: f.vehicleId,
        templateId: firstId,
        type: "initial",
        requestKey: "template-snapshot",
      },
    );
    const secondId = await f.owner.mutation(saveTemplate, {
      ...template,
      id: firstId,
      requestKey: "template-version-two",
      expectedRevision: first.revision,
      items: [
        {
          ...template.items[0],
          labels: {
            en: "Revised tyres",
            fr: "Pneus révisés",
            ar: "إطارات معدلة",
          },
        },
      ],
    });
    const second = await f.owner.query(getTemplate, {
      agencyId: f.agencyId,
      id: secondId,
    });
    const original = await f.owner.query(
      makeFunctionReference<"query">("inspections:get"),
      { agencyId: f.agencyId, id: inspectionId },
    );
    expect(original.items[0].labels.en).toBe("Tyres");
    expect(original.templateVersion).toBe(1);
    const old = await f.owner.query(getTemplate, {
      agencyId: f.agencyId,
      id: firstId,
    });
    await expect(
      f.owner.mutation(setActive, {
        agencyId: f.agencyId,
        id: firstId,
        expectedRevision: old.revision,
        active: true,
        requestKey: "template-lifecycle-1",
      }),
    ).rejects.toThrow("OPERATIONS_CONFLICT");
    await expect(
      f.reader.mutation(setActive, {
        agencyId: f.agencyId,
        id: secondId,
        expectedRevision: second.revision,
        active: false,
        requestKey: "template-lifecycle-2",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await f.owner.mutation(setActive, {
      agencyId: f.agencyId,
      id: secondId,
      expectedRevision: second.revision,
      active: false,
      requestKey: "template-lifecycle-3",
    });
    await f.owner.mutation(setActive, {
      agencyId: f.agencyId,
      id: secondId,
      expectedRevision: second.revision,
      active: false,
      requestKey: "template-lifecycle-3",
    });
    await expect(
      f.owner.mutation(setActive, {
        agencyId: f.agencyId,
        id: secondId,
        expectedRevision: second.revision,
        active: true,
        requestKey: "template-lifecycle-4",
      }),
    ).rejects.toThrow("OPERATIONS_CONFLICT");
    await f.owner.mutation(setActive, {
      agencyId: f.agencyId,
      id: secondId,
      expectedRevision: second.revision + 1,
      active: true,
      requestKey: "template-lifecycle-5",
    });
    const archived = await f.owner.query(history, {
      agencyId: f.agencyId,
      active: false,
      paginationOpts: { cursor: null, numItems: 50 },
    });
    expect(archived.page).toHaveLength(1);
    expect(archived.page[0].latest).toBe(false);
    const restored = await f.owner.query(getTemplate, {
      agencyId: f.agencyId,
      id: secondId,
    });
    expect(restored.version).toBe(2);
    expect(restored.items[0].labels.en).toBe("Revised tyres");
    expect(await f.owner.mutation(saveTemplate, template)).toBe(firstId);
  });

  test("manual availability history retains released allocations and resolution findings", async () => {
    const f = await fixture();
    const startAt = Date.now() + 60_000;
    const id = await f.owner.mutation(
      makeFunctionReference<"mutation">("operations:saveDowntime"),
      {
        agencyId: f.agencyId,
        vehicleId: f.vehicleId,
        expectedRevision: 0,
        startAt,
        endAt: startAt + 3600_000,
        reason: "Preparation",
        requestKey: "manual-window",
      },
    );
    const args = {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      paginationOpts: { cursor: null, numItems: 10 },
    };
    const allocations = makeFunctionReference<"query">(
      "operations:allocationHistory",
    );
    const issues = makeFunctionReference<"query">("operations:issueHistory");
    const active = await f.reader.query(allocations, {
      ...args,
      blocking: true,
    });
    await f.owner.mutation(
      makeFunctionReference<"mutation">("operations:releaseDowntime"),
      {
        agencyId: f.agencyId,
        id,
        expectedRevision: active.page[0].revision,
        requestKey: "manual-release",
      },
    );
    expect(
      (await f.reader.query(allocations, { ...args, blocking: true })).page,
    ).toHaveLength(0);
    expect(
      (await f.reader.query(allocations, { ...args, blocking: false })).page[0]
        .reason,
    ).toBe("Preparation");
    const manualIssue = makeFunctionReference<"mutation">(
      "operations:manualIssue",
    );
    await f.owner.mutation(manualIssue, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      expectedRevision: 0,
      reason: "Missing spare key",
      resolve: false,
      requestKey: "manual-hold",
    });
    const issue = (
      await f.reader.query(issues, { ...args, active: true })
    ).page.find(
      (row: { source: { kind: string } }) => row.source.kind === "manual",
    );
    await f.owner.mutation(manualIssue, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      id: issue._id,
      expectedRevision: issue.revision,
      reason: "Spare key received and tested",
      resolve: true,
      requestKey: "manual-resolve",
    });
    expect(
      (await f.reader.query(issues, { ...args, active: false })).page[0]
        .resolution,
    ).toBe("Spare key received and tested");
  });
  test("schedule edits preserve revisions and permissions; archives close only their task", async () => {
    const f = await fixture();
    const create = {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      expectedRevision: 0,
      service: "Oil service",
      days: 30,
      active: true,
      requestKey: "schedule-ui-create",
    };
    const id = (await f.owner.mutation(
      maintenance.saveSchedule,
      create,
    )) as Id<"maintenanceSchedules">;
    expect(await f.owner.mutation(maintenance.saveSchedule, create)).toBe(id);
    await expect(
      f.owner.mutation(maintenance.saveSchedule, { ...create, days: 60 }),
    ).rejects.toThrow("REQUEST_KEY_REUSED");
    const otherId = (await f.owner.mutation(maintenance.saveSchedule, {
      ...create,
      service: "Tyres",
      requestKey: "schedule-ui-other",
    })) as Id<"maintenanceSchedules">;
    const edit = {
      ...create,
      id,
      expectedRevision: 1,
      days: 60,
      requestKey: "schedule-ui-edit",
    };
    await expect(
      f.reader.mutation(maintenance.saveSchedule, edit),
    ).rejects.toThrow("PERMISSION_DENIED");
    await f.owner.mutation(maintenance.saveSchedule, edit);
    await expect(
      f.owner.mutation(maintenance.saveSchedule, {
        ...edit,
        requestKey: "schedule-ui-stale",
      }),
    ).rejects.toThrow("OPERATIONS_CONFLICT");
    const read = await f.reader.query(maintenance.getSchedule, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      id,
    });
    expect(read).toMatchObject({ revision: 2, days: 60, baselineValid: false });
    await f.owner.mutation(maintenance.saveSchedule, {
      ...edit,
      expectedRevision: 2,
      active: false,
      requestKey: "schedule-ui-archive",
    });
    const tasks = await f.t.run((ctx) =>
      ctx.db
        .query("operationalTasks")
        .withIndex("by_agency_status_due", (q) => q.eq("agencyId", f.agencyId))
        .take(10),
    );
    expect(
      tasks.find((task) => task.sourceKey === `schedule:${id}`)?.status,
    ).toBe("done");
    expect(
      tasks.find((task) => task.sourceKey === `schedule:${otherId}`)?.status,
    ).toBe("open");
    await f.owner.mutation(maintenance.saveSchedule, {
      ...edit,
      expectedRevision: 3,
      requestKey: "schedule-ui-restore",
    });
    const restored = await f.t.run((ctx) =>
      ctx.db
        .query("operationalTasks")
        .withIndex("by_agency_source", (q) =>
          q.eq("agencyId", f.agencyId).eq("sourceKey", `schedule:${id}`),
        )
        .unique(),
    );
    expect(restored?.status).toBe("open");
    const foreignAgency = await f.t.run((ctx) =>
      ctx.db.insert("agencies", {
        name: "Other",
        slug: "other-schedule-test",
        status: "active",
        timezone: "Africa/Casablanca",
        currency: "MAD",
        policyVersion: 1,
        createdByUserId: f.ownerId,
      }),
    );
    await expect(
      f.owner.query(maintenance.listSchedules, {
        agencyId: foreignAgency,
        vehicleId: f.vehicleId,
        active: true,
        paginationOpts: { cursor: null, numItems: 20 },
      }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
  });

  test("archived schedule history remains pageable beyond the active schedule limit", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 55; i++)
        await ctx.db.insert("maintenanceSchedules", {
          agencyId: f.agencyId,
          vehicleId: f.vehicleId,
          actorId: f.ownerId,
          recordedAt: Date.now(),
          revision: 1,
          service: `Historic service ${i}`,
          days: 30,
          baselineValid: false,
          timezone: "Africa/Casablanca",
          active: false,
        });
    });
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 3; i++) {
      const result: {
        page: { _id: string }[];
        continueCursor: string;
        isDone: boolean;
      } = await f.reader.query(maintenance.listSchedules, {
        agencyId: f.agencyId,
        vehicleId: f.vehicleId,
        active: false,
        paginationOpts: { cursor, numItems: 50 },
      });
      expect(result.page.length).toBeLessThanOrEqual(25);
      ids.push(...result.page.map((row: { _id: string }) => row._id));
      cursor = result.continueCursor;
      expect(result.isDone).toBe(i === 2);
    }
    expect(new Set(ids).size).toBe(55);
  });

  test("backfills archived vehicles once before enabling operations", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      const guard = await ctx.db
        .query("vehicleAvailabilityStates")
        .withIndex("by_agency_vehicle", (q) =>
          q.eq("agencyId", f.agencyId).eq("vehicleId", f.vehicleId),
        )
        .unique();
      await ctx.db.delete(guard!._id);
      const migration = await ctx.db
        .query("operationsMigrations")
        .withIndex("by_agency", (q) => q.eq("agencyId", f.agencyId))
        .unique();
      await ctx.db.delete(migration!._id);
      await ctx.db.patch(f.vehicleId, { lifecycle: "archived" });
    });
    expect(
      await f.t.mutation(operations.migrateAgency, { agencyId: f.agencyId }),
    ).toEqual({ complete: true, processed: 1 });
    expect(
      await f.t.mutation(operations.migrateAgency, { agencyId: f.agencyId }),
    ).toEqual({ complete: true, processed: 0 });
    const guards = await f.t.run((ctx) =>
      ctx.db
        .query("vehicleAvailabilityStates")
        .withIndex("by_agency_vehicle", (q) =>
          q.eq("agencyId", f.agencyId).eq("vehicleId", f.vehicleId),
        )
        .take(2),
    );
    expect(guards).toHaveLength(1);
    expect(guards[0]!.verified).toBe(false);
    expect(guards[0]!.readiness).toBe("needs_review");
  });

  test("scheduled refresh reopens a due maintenance task without duplicates", async () => {
    vi.useFakeTimers();
    try {
      const f = await fixture();
      const scheduleId = (await f.owner.mutation(maintenance.saveSchedule, {
        agencyId: f.agencyId,
        vehicleId: f.vehicleId,
        expectedRevision: 0,
        service: "Scheduled oil service",
        days: 30,
        active: true,
        requestKey: "schedule-sweep-001",
      })) as Id<"maintenanceSchedules">;
      await f.t.run((ctx) =>
        ctx.db.patch(scheduleId, {
          baselineValid: true,
          baselineAt: Date.now(),
          nextDueAt: Date.now() + 60_000,
        }),
      );
      const tasks = () =>
        f.t.run((ctx) =>
          ctx.db
            .query("operationalTasks")
            .withIndex("by_agency_source", (q) =>
              q
                .eq("agencyId", f.agencyId)
                .eq("sourceKey", `schedule:${scheduleId}`),
            )
            .take(2),
        );
      await f.t.mutation(operations.sweep, { cursor: null });
      expect((await tasks())[0]!.status).toBe("done");
      vi.setSystemTime(Date.now() + 60_001);
      await f.t.mutation(operations.sweep, { cursor: null });
      await f.t.mutation(operations.sweep, { cursor: null });
      const dueTasks = await tasks();
      expect(dueTasks).toHaveLength(1);
      expect(dueTasks[0]!.status).toBe("open");
      expect(dueTasks[0]!.automatic).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

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
    await expect(
      f.owner.mutation(maintenance.saveSchedule, {
        agencyId: f.agencyId,
        vehicleId: f.vehicleId,
        id: scheduleId,
        expectedRevision: 1,
        service: "Oil service",
        days: 180,
        meters: 10_000_000,
        active: false,
        requestKey: "schedule-archive-planned",
      }),
    ).rejects.toThrow("MAINTENANCE_SCHEDULE_HAS_WORK");
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
    await expect(
      f.owner.mutation(maintenance.saveSchedule, {
        agencyId: f.agencyId,
        vehicleId: f.vehicleId,
        id: scheduleId,
        expectedRevision: 1,
        service: "Oil service",
        days: 180,
        meters: 10_000_000,
        active: false,
        requestKey: "schedule-archive-started",
      }),
    ).rejects.toThrow("MAINTENANCE_SCHEDULE_HAS_WORK");
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
    await f.owner.mutation(maintenance.saveSchedule, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      id: scheduleId,
      expectedRevision: state.schedule!.revision,
      service: "Oil service",
      days: 30,
      meters: 5_000_000,
      active: false,
      requestKey: "schedule-archive-completed",
    });
    const archived = await f.owner.query(maintenance.getSchedule, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      id: scheduleId,
    });
    expect(archived).toMatchObject({
      active: false,
      lastRecordId: recordId,
      baselineMeters: 42_000_000,
      nextDueMeters: 47_000_000,
    });
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
