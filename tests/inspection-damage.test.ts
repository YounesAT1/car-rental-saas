import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { defaultHours } from "../src/lib/agency-settings";

const modules = {
  "../convex/_generated/server.js": () => import("../convex/_generated/server"),
  "../convex/inspections.ts": () => import("../convex/inspections"),
  "../convex/damage.ts": () => import("../convex/damage"),
};
const inspections = {
  create: makeFunctionReference<"mutation">("inspections:create"),
  amend: makeFunctionReference<"mutation">("inspections:amend"),
  save: makeFunctionReference<"mutation">("inspections:save"),
  complete: makeFunctionReference<"mutation">("inspections:complete"),
};
const damage = {
  report: makeFunctionReference<"mutation">("damage:report"),
  transition: makeFunctionReference<"mutation">("damage:transition"),
  get: makeFunctionReference<"query">("damage:get"),
};

async function fixture() {
  const t = convexTest(schema, modules);
  const issuer = "https://test.clerk.accounts.dev";
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      issuer,
      subject: "owner-inspection",
      status: "active",
      identityUpdatedAt: now,
    });
    const readerId = await ctx.db.insert("users", {
      issuer,
      subject: "reader-inspection",
      status: "active",
      identityUpdatedAt: now,
    });
    const agencyId = await ctx.db.insert("agencies", {
      name: "Atlas",
      slug: "atlas-inspection",
      status: "active",
      timezone: "Africa/Casablanca",
      currency: "MAD",
      policyVersion: 1,
      complianceRevision: 0,
      createdByUserId: ownerId,
    });
    for (const [userId, roleKey] of [
      [ownerId, "AGENCY_OWNER"],
      [readerId, "READ_ONLY"],
    ] as const)
      await ctx.db.insert("agencyMembers", {
        agencyId,
        userId,
        roleKey,
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
    const templateId = await ctx.db.insert("inspectionTemplates", {
      agencyId,
      actorId: ownerId,
      recordedAt: now,
      revision: 1,
      code: "INITIAL",
      name: { en: "Initial", fr: "Initiale", ar: "أولي" },
      version: 1,
      active: true,
      items: [
        {
          code: "BRAKES",
          labels: { en: "Brakes", fr: "Freins", ar: "الفرامل" },
          safety: true,
          required: true,
        },
        {
          code: "CLEAN",
          labels: { en: "Cleanliness", fr: "Propreté", ar: "النظافة" },
          safety: false,
          required: true,
        },
      ],
    });
    return { ownerId, agencyId, vehicleId, templateId };
  });
  return {
    t,
    owner: t.withIdentity({ issuer, subject: "owner-inspection" }),
    reader: t.withIdentity({ issuer, subject: "reader-inspection" }),
    ...ids,
  };
}

describe("inspections and damage", () => {
  test("fails closed, then an amendment can restore verified readiness", async () => {
    const f = await fixture();
    const inspectionId = (await f.owner.mutation(inspections.create, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      templateId: f.templateId,
      type: "initial",
      requestKey: "inspect-create-001",
    })) as Id<"vehicleInspections">;
    await expect(
      f.owner.mutation(inspections.complete, {
        agencyId: f.agencyId,
        id: inspectionId,
        expectedRevision: 1,
        requestKey: "inspect-done-000",
      }),
    ).rejects.toThrow("INSPECTION_INCOMPLETE");
    await f.owner.mutation(inspections.save, {
      agencyId: f.agencyId,
      id: inspectionId,
      expectedRevision: 1,
      items: [
        { code: "BRAKES", result: "fail", notes: "Worn pads" },
        { code: "CLEAN", result: "pass", notes: "" },
      ],
      notes: "Brake work required",
      fuelPercent: 60,
      acknowledgment: true,
      requestKey: "inspect-save-001",
    });
    await f.owner.mutation(inspections.complete, {
      agencyId: f.agencyId,
      id: inspectionId,
      expectedRevision: 2,
      requestKey: "inspect-done-001",
    });
    expect(
      await f.t.run(
        async (ctx) =>
          (
            await ctx.db
              .query("vehicleAvailabilityStates")
              .withIndex("by_agency_vehicle", (q) =>
                q.eq("agencyId", f.agencyId).eq("vehicleId", f.vehicleId),
              )
              .unique()
          )?.readiness,
      ),
    ).toBe("blocked");
    const amendmentId = (await f.owner.mutation(inspections.amend, {
      agencyId: f.agencyId,
      originalId: inspectionId,
      reason: "Brake repair verified",
      requestKey: "inspect-amend-001",
    })) as Id<"vehicleInspections">;
    await f.owner.mutation(inspections.save, {
      agencyId: f.agencyId,
      id: amendmentId,
      expectedRevision: 1,
      items: [
        { code: "BRAKES", result: "pass", notes: "New pads" },
        { code: "CLEAN", result: "pass", notes: "" },
      ],
      notes: "Verified after repair",
      fuelPercent: 60,
      acknowledgment: true,
      requestKey: "inspect-save-002",
    });
    await f.owner.mutation(inspections.complete, {
      agencyId: f.agencyId,
      id: amendmentId,
      expectedRevision: 2,
      requestKey: "inspect-done-002",
    });
    const result = await f.t.run(async (ctx) => ({
      guard: await ctx.db
        .query("vehicleAvailabilityStates")
        .withIndex("by_agency_vehicle", (q) =>
          q.eq("agencyId", f.agencyId).eq("vehicleId", f.vehicleId),
        )
        .unique(),
      issue: await ctx.db
        .query("vehicleReadinessIssues")
        .withIndex("by_agency_source", (q) =>
          q
            .eq("agencyId", f.agencyId)
            .eq("vehicleId", f.vehicleId)
            .eq("sourceKey", `inspection:${inspectionId}`),
        )
        .unique(),
    }));
    expect(result.guard?.verified).toBe(true);
    expect(result.guard?.readiness).toBe("ready");
    expect(result.issue?.active).toBe(false);
  });

  test("requires evidence before damage resolution and redacts estimates", async () => {
    const f = await fixture();
    const inspectionId = (await f.owner.mutation(inspections.create, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      templateId: f.templateId,
      type: "initial",
      requestKey: "inspect-create-003",
    })) as Id<"vehicleInspections">;
    await f.owner.mutation(inspections.save, {
      agencyId: f.agencyId,
      id: inspectionId,
      expectedRevision: 1,
      items: [
        { code: "BRAKES", result: "pass", notes: "" },
        { code: "CLEAN", result: "pass", notes: "" },
      ],
      notes: "Initial inspection passed",
      fuelPercent: 80,
      acknowledgment: true,
      requestKey: "inspect-save-003",
    });
    await f.owner.mutation(inspections.complete, {
      agencyId: f.agencyId,
      id: inspectionId,
      expectedRevision: 2,
      requestKey: "inspect-done-003",
    });
    const damageId = (await f.owner.mutation(damage.report, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      inspectionId,
      location: "Front bumper",
      description: "Deep crack near the left mount",
      severity: "blocking",
      responsibility: "unknown",
      disputed: false,
      estimateMinor: 250000,
      expectedCurrency: "MAD",
      requestKey: "damage-report-001",
    })) as Id<"damageReports">;
    expect(
      (
        await f.reader.query(damage.get, {
          agencyId: f.agencyId,
          id: damageId,
        })
      )?.estimateMinor,
    ).toBeNull();
    for (const [status, revision] of [
      ["reviewing", 1],
      ["approved", 2],
      ["repairing", 3],
    ] as const)
      await f.owner.mutation(damage.transition, {
        agencyId: f.agencyId,
        id: damageId,
        expectedRevision: revision,
        status,
        resolution: "",
        requestKey: `damage-${status}-001`,
      });
    await expect(
      f.owner.mutation(damage.transition, {
        agencyId: f.agencyId,
        id: damageId,
        expectedRevision: 4,
        status: "resolved",
        resolution: "Bumper replaced",
        requestKey: "damage-resolved-000",
      }),
    ).rejects.toThrow("DAMAGE_EVIDENCE_REQUIRED");
    await f.t.run(async (ctx) => {
      const intentId = await ctx.db.insert("privateUploadIntents", {
        agencyId: f.agencyId,
        vehicleId: f.vehicleId,
        actorId: f.ownerId,
        owner: { kind: "damage", id: damageId },
        ownerKey: `damage:${damageId}`,
        expectedRevision: 4,
        status: "done",
        expiresAt: Date.now(),
        reservedBytes: 0,
        registeredHashes: [],
      });
      await ctx.db.insert("files", {
        agencyId: f.agencyId,
        vehicleId: f.vehicleId,
        owner: { kind: "damage", id: damageId },
        ownerKey: `damage:${damageId}`,
        actorId: f.ownerId,
        intentId,
        recordedAt: Date.now(),
        pageCount: 1,
        bytes: 10,
        sourceHash: "synthetic",
      });
    });
    await f.owner.mutation(damage.transition, {
      agencyId: f.agencyId,
      id: damageId,
      expectedRevision: 4,
      status: "resolved",
      resolution: "Bumper replaced",
      requestKey: "damage-resolved-001",
    });
    const state = await f.t.run(async (ctx) => ({
      guard: await ctx.db
        .query("vehicleAvailabilityStates")
        .withIndex("by_agency_vehicle", (q) =>
          q.eq("agencyId", f.agencyId).eq("vehicleId", f.vehicleId),
        )
        .unique(),
      issue: await ctx.db
        .query("vehicleReadinessIssues")
        .withIndex("by_agency_source", (q) =>
          q
            .eq("agencyId", f.agencyId)
            .eq("vehicleId", f.vehicleId)
            .eq("sourceKey", `damage:${damageId}`),
        )
        .unique(),
      task: await ctx.db
        .query("operationalTasks")
        .withIndex("by_agency_source", (q) =>
          q.eq("agencyId", f.agencyId).eq("sourceKey", `damage:${damageId}`),
        )
        .unique(),
    }));
    expect(state.guard?.readiness).toBe("ready");
    expect(state.issue?.active).toBe(false);
    expect(state.task?.status).toBe("done");
  });
});
