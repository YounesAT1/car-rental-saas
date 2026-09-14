import { convexTest } from "convex-test";
import type { GenericDatabaseWriter, SystemDataModel } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { defaultHours } from "../src/lib/agency-settings";
import { PRIVATE_OUTPUT_LIMIT } from "../src/lib/operations";

const modules = {
  "../convex/_generated/server.js": () => import("../convex/_generated/server"),
  "../convex/privateFiles.ts": () => import("../convex/privateFiles"),
  "../convex/vehicleDocuments.ts": () => import("../convex/vehicleDocuments"),
};

const documents = {
  saveDraft: makeFunctionReference<"mutation">("vehicleDocuments:saveDraft"),
  compliance: makeFunctionReference<"query">("vehicleDocuments:compliance"),
};
const privateFiles = {
  begin: makeFunctionReference<"mutation">("privateFiles:begin"),
  acquire: makeFunctionReference<"mutation">("privateFiles:acquire"),
  registerBlob: makeFunctionReference<"mutation">("privateFiles:registerBlob"),
  attachBlob: makeFunctionReference<"mutation">("privateFiles:attachBlob"),
  finish: makeFunctionReference<"mutation">("privateFiles:finish"),
  failProcessing: makeFunctionReference<"mutation">(
    "privateFiles:failProcessing",
  ),
  list: makeFunctionReference<"query">("privateFiles:list"),
  manifest: makeFunctionReference<"query">("privateFiles:manifest"),
  authorizeDownload: makeFunctionReference<"mutation">(
    "privateFiles:authorizeDownload",
  ),
};

async function fixture() {
  const t = convexTest(schema, modules);
  const issuer = "https://test.clerk.accounts.dev";
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      issuer,
      subject: "owner-private",
      status: "active",
      identityUpdatedAt: now,
    });
    const outsiderId = await ctx.db.insert("users", {
      issuer,
      subject: "outsider-private",
      status: "active",
      identityUpdatedAt: now,
    });
    const agencyId = await ctx.db.insert("agencies", {
      name: "Atlas",
      slug: "atlas-private",
      status: "active",
      timezone: "Africa/Casablanca",
      currency: "MAD",
      policyVersion: 1,
      complianceRevision: 1,
      createdByUserId: ownerId,
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
      complianceRevision: 1,
      odometerOffset: 0,
      epochStartedAt: 0,
    });
    await ctx.db.insert("operationsMigrations", {
      agencyId,
      complete: true,
      cursor: null,
    });
    const typeId = await ctx.db.insert("vehicleDocumentTypes", {
      agencyId,
      actorId: ownerId,
      recordedAt: now,
      revision: 1,
      code: "REGISTRATION",
      labels: { en: "Registration", fr: "Carte grise", ar: "رخصة التسجيل" },
      required: true,
      expiryRequired: true,
      active: true,
    });
    return { agencyId, vehicleId, typeId, ownerId, outsiderId };
  });
  return {
    t,
    owner: t.withIdentity({ issuer, subject: "owner-private" }),
    outsider: t.withIdentity({ issuer, subject: "outsider-private" }),
    ...ids,
  };
}

async function storeWithContentType(
  f: Awaited<ReturnType<typeof fixture>>,
  content: string,
  contentType: string,
) {
  const storageId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob([content], { type: contentType })),
  );
  await f.t.run(async (ctx) => {
    const system = ctx.db as unknown as GenericDatabaseWriter<SystemDataModel>;
    await system.patch(storageId, { contentType });
  });
  const metadata = await f.t.run((ctx) => ctx.db.system.get(storageId));
  return { storageId, hash: metadata!.sha256 };
}

describe("private operational evidence", () => {
  test("publishes a complete processed manifest and makes the document current", async () => {
    const f = await fixture();
    const documentId = (await f.owner.mutation(documents.saveDraft, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      expectedRevision: 0,
      typeId: f.typeId,
      number: "ABC-123",
      issuer: "NARSA",
      issuedDate: "2026-01-01",
      expiryDate: "2027-01-01",
      requestKey: "document-001",
    })) as Id<"vehicleDocuments">;
    const owner = { kind: "document" as const, id: documentId };
    const intentId = (await f.owner.mutation(privateFiles.begin, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      owner,
      expectedRevision: 1,
    })) as Id<"privateUploadIntents">;
    await f.owner.mutation(privateFiles.acquire, { intentId });
    const source = await storeWithContentType(
      f,
      "private source",
      "application/octet-stream",
    );
    const sourceRegistry = (await f.owner.mutation(privateFiles.registerBlob, {
      intentId,
      hash: source.hash,
      kind: "source",
    })) as Id<"privateFileBlobs">;
    await f.owner.mutation(privateFiles.attachBlob, {
      registryId: sourceRegistry,
      storageId: source.storageId,
    });
    const page = await storeWithContentType(f, "processed", "image/webp");
    const pageRegistry = (await f.owner.mutation(privateFiles.registerBlob, {
      intentId,
      hash: page.hash,
      kind: "page",
      position: 0,
    })) as Id<"privateFileBlobs">;
    await f.owner.mutation(privateFiles.attachBlob, {
      registryId: pageRegistry,
      storageId: page.storageId,
    });
    const fileId = (await f.owner.mutation(privateFiles.finish, {
      intentId,
      pages: [{ registryId: pageRegistry, storageId: page.storageId }],
    })) as Id<"files">;
    const files = await f.owner.query(privateFiles.list, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      owner,
    });
    const manifest = await f.owner.query(privateFiles.manifest, {
      agencyId: f.agencyId,
      fileId,
    });
    const compliance = await f.owner.query(documents.compliance, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
    });
    const state = await f.t.run(async (ctx) => ({
      document: await ctx.db.get(documentId),
      usage: await ctx.db
        .query("privateFileUsage")
        .withIndex("by_agency", (q) => q.eq("agencyId", f.agencyId))
        .unique(),
      source: await ctx.db.system.get(source.storageId),
    }));
    expect(files).toEqual([
      expect.objectContaining({ id: fileId, pageCount: 1 }),
    ]);
    expect(manifest).toEqual([
      expect.objectContaining({ position: 0, bytes: 9 }),
    ]);
    expect(compliance[0]?.state).toBe("valid");
    expect(state.document?.status).toBe("current");
    expect(state.document?.fileId).toBe(fileId);
    expect(state.usage?.bytes).toBe(9);
    expect(state.usage?.reservedBytes).toBe(0);
    expect(state.source).toBeNull();
    const pageId = manifest![0]!.id as Id<"privateFilePages">;
    expect(
      await f.owner.mutation(privateFiles.authorizeDownload, {
        fileId,
        pageId,
      }),
    ).toEqual(expect.objectContaining({ storageId: page.storageId }));
    await expect(
      f.outsider.mutation(privateFiles.authorizeDownload, { fileId, pageId }),
    ).rejects.toThrow();
  });

  test("limits live intents and releases reserved quota on failure", async () => {
    const f = await fixture();
    const documentId = (await f.owner.mutation(documents.saveDraft, {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      expectedRevision: 0,
      typeId: f.typeId,
      number: "",
      issuer: "",
      issuedDate: "",
      expiryDate: "2027-01-01",
      requestKey: "document-002",
    })) as Id<"vehicleDocuments">;
    const args = {
      agencyId: f.agencyId,
      vehicleId: f.vehicleId,
      owner: { kind: "document" as const, id: documentId },
      expectedRevision: 1,
    };
    const first = (await f.owner.mutation(
      privateFiles.begin,
      args,
    )) as Id<"privateUploadIntents">;
    await f.owner.mutation(privateFiles.begin, args);
    await expect(f.owner.mutation(privateFiles.begin, args)).rejects.toThrow(
      "PRIVATE_FILE_LIMIT",
    );
    await f.owner.mutation(privateFiles.acquire, { intentId: first });
    await f.owner.mutation(privateFiles.failProcessing, { intentId: first });
    const usage = await f.t.run((ctx) =>
      ctx.db
        .query("privateFileUsage")
        .withIndex("by_agency", (q) => q.eq("agencyId", f.agencyId))
        .unique(),
    );
    expect(usage?.reservedBytes).toBe(PRIVATE_OUTPUT_LIMIT);
    const third = await f.owner.mutation(privateFiles.begin, args);
    expect(third).toBeDefined();
  });
});
