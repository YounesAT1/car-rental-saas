import { convexTest } from "convex-test";
import type { GenericDatabaseWriter, SystemDataModel } from "convex/server";
import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { defaultHours } from "../src/lib/agency-settings";
import { MAX_STORED_PHOTO_BYTES, STORAGE_LIMIT } from "../src/lib/fleet";
const modules = {
  "../convex/_generated/server.js": () => import("../convex/_generated/server"),
  "../convex/fleet.ts": () => import("../convex/fleet"),
  "../convex/fleetCatalogs.ts": () => import("../convex/fleetCatalogs"),
  "../convex/fleetPhotos.ts": () => import("../convex/fleetPhotos"),
};
const page = { numItems: 2, cursor: null };
const labels = { en: "Economy", fr: "Économique", ar: "اقتصادية" };
async function fixture() {
  const t = convexTest(schema, modules);
  const issuer = "https://test.clerk.accounts.dev";
  const { a, b, branch, otherBranch, ownerId, staffId } = await t.run(
    async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        issuer,
        subject: "owner",
        status: "active",
        identityUpdatedAt: Date.now(),
      });
      const staffId = await ctx.db.insert("users", {
        issuer,
        subject: "staff",
        status: "active",
        identityUpdatedAt: Date.now(),
      });
      const a = await ctx.db.insert("agencies", {
        name: "Atlas",
        slug: "atlas",
        status: "active",
        timezone: "Africa/Casablanca",
        currency: "MAD",
        policyVersion: 1,
        createdByUserId: ownerId,
      });
      const b = await ctx.db.insert("agencies", {
        name: "Other",
        slug: "other",
        status: "active",
        timezone: "Africa/Casablanca",
        currency: "MAD",
        policyVersion: 1,
        createdByUserId: ownerId,
      });
      await ctx.db.insert("agencyMembers", {
        agencyId: a,
        userId: ownerId,
        roleKey: "AGENCY_OWNER",
        status: "active",
        branchScope: "all",
        joinedAt: Date.now(),
        revision: 1,
      });
      await ctx.db.insert("agencyMembers", {
        agencyId: a,
        userId: staffId,
        roleKey: "FLEET_MANAGER",
        status: "active",
        branchScope: "all",
        joinedAt: Date.now(),
        revision: 1,
      });
      const values = {
        name: "Airport",
        code: "CMN",
        address: "Terminal 1",
        city: "Casablanca",
        postalCode: "",
        country: "MA" as const,
        timezone: "Africa/Casablanca" as const,
        phone: "",
        contactEmail: "",
        hours: defaultHours(),
        closures: [],
        status: "active" as const,
        revision: 1,
        updatedAt: Date.now(),
        createdByUserId: ownerId,
      };
      const branch = await ctx.db.insert("branches", {
        ...values,
        agencyId: a,
      });
      const otherBranch = await ctx.db.insert("branches", {
        ...values,
        agencyId: b,
      });
      return { a, b, branch, otherBranch, ownerId, staffId };
    },
  );
  const owner = t.withIdentity({ subject: "owner", issuer });
  const staff = t.withIdentity({ subject: "staff", issuer });
  const category = await owner.mutation(api.fleetCatalogs.save, {
    agencyId: a,
    kind: "category",
    expectedRevision: 0,
    values: { code: "ECO", labels, publicVisible: true },
  });
  const feature = await owner.mutation(api.fleetCatalogs.save, {
    agencyId: a,
    kind: "feature",
    expectedRevision: 0,
    values: {
      code: "AC",
      labels: { ...labels, en: "Air conditioning" },
      publicVisible: true,
    },
  });
  const values = {
    fleetNumber: "AT-001",
    plate: "12345-A-6",
    vin: "",
    make: "Dacia",
    model: "Sandero",
    trim: "Stepway",
    year: 2025,
    color: "Blue",
    transmission: "manual" as const,
    fuel: "diesel" as const,
    seats: 5,
    doors: 5,
    branchId: branch,
    categoryId: category,
    featureIds: [feature],
    description: "Comfortable city car",
    notes: "Internal note",
  };
  const create = () =>
    owner.mutation(api.fleet.save, {
      agencyId: a,
      expectedRevision: 0,
      values,
    });
  return {
    t,
    owner,
    staff,
    a,
    b,
    branch,
    otherBranch,
    ownerId,
    staffId,
    category,
    feature,
    values,
    create,
  };
}
describe("fleet integrity and permissions", () => {
  test("creates hidden, audited records; cost reads and writes are independently protected", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    expect(
      await f.owner.query(api.fleet.get, { agencyId: f.a, vehicleId }),
    ).toMatchObject({
      publicVisible: false,
      revision: 1,
      acquisitionCost: null,
    });
    await f.owner.mutation(api.fleet.setCost, {
      agencyId: f.a,
      vehicleId,
      expectedRevision: 1,
      amountMinor: 12000000,
      expectedCurrency: "MAD",
    });
    expect(
      (await f.owner.query(api.fleet.get, { agencyId: f.a, vehicleId }))
        ?.acquisitionCost,
    ).toEqual({ amountMinor: 12000000, currency: "MAD" });
    expect(
      (await f.staff.query(api.fleet.get, { agencyId: f.a, vehicleId }))
        ?.acquisitionCost,
    ).toBeNull();
    await expect(
      f.staff.mutation(api.fleet.setCost, {
        agencyId: f.a,
        vehicleId,
        expectedRevision: 2,
        amountMinor: 1,
        expectedCurrency: "MAD",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      f.staff.mutation(api.fleet.setVisibility, {
        agencyId: f.a,
        vehicleId,
        expectedRevision: 2,
        publicVisible: true,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await f.t.run((ctx) => ctx.db.patch(f.a, { currency: "EUR" }));
    await expect(
      f.owner.mutation(api.fleet.setCost, {
        agencyId: f.a,
        vehicleId,
        expectedRevision: 2,
        amountMinor: 12000000,
        expectedCurrency: "MAD",
      }),
    ).rejects.toThrow("FLEET_CONFLICT");
    const counter = await f.t.run((ctx) =>
      ctx.db
        .query("fleetUsage")
        .withIndex("by_agency", (q) => q.eq("agencyId", f.a))
        .unique(),
    );
    expect(counter?.vehicles).toBe(1);
  });
  test("rejects cross-tenant queries, references and forged resource ownership", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    await expect(
      f.owner.query(api.fleet.get, { agencyId: f.b, vehicleId }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
    await expect(
      f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        expectedRevision: 0,
        values: {
          ...f.values,
          fleetNumber: "AT-002",
          plate: "2",
          branchId: f.otherBranch,
        },
      }),
    ).rejects.toThrow("FLEET_REFERENCE");
    await expect(
      f.t.query(api.fleet.get, { agencyId: f.a, vehicleId }),
    ).rejects.toThrow();
    await f.t.run((ctx) => ctx.db.patch(vehicleId, { agencyId: f.b }));
    expect(
      await f.owner.query(api.fleet.get, { agencyId: f.a, vehicleId }),
    ).toBeNull();
  });
  test("normalizes unique identifiers and keeps them reserved after archive", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    await f.owner.mutation(api.fleet.setStatus, {
      agencyId: f.a,
      vehicleId,
      expectedRevision: 1,
      lifecycle: "archived",
    });
    await expect(
      f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        expectedRevision: 0,
        values: { ...f.values, fleetNumber: "AT-002", plate: "12345 a 6" },
      }),
    ).rejects.toThrow("FLEET_DUPLICATE");
    await expect(
      f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        expectedRevision: 0,
        values: { ...f.values, fleetNumber: "at001", plate: "other" },
      }),
    ).rejects.toThrow("FLEET_DUPLICATE");
    await expect(
      f.owner.mutation(api.fleetCatalogs.save, {
        agencyId: f.a,
        kind: "category",
        expectedRevision: 0,
        values: { code: "eco", labels, publicVisible: true },
      }),
    ).rejects.toThrow("FLEET_DUPLICATE");
  });
  test("optional VIN uniqueness applies only to meaningful VINs", async () => {
    const f = await fixture();
    await f.create();
    await f.owner.mutation(api.fleet.save, {
      agencyId: f.a,
      expectedRevision: 0,
      values: { ...f.values, fleetNumber: "AT-002", plate: "2" },
    });
    await expect(
      f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        expectedRevision: 0,
        values: {
          ...f.values,
          fleetNumber: "AT-003",
          plate: "3",
          vin: "NOT-A-VIN",
        },
      }),
    ).rejects.toThrow("INVALID_FLEET");
  });
  test("revision conflicts prevent overwrite and archive restores hidden", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    await f.owner.mutation(api.fleet.setVisibility, {
      agencyId: f.a,
      vehicleId,
      expectedRevision: 1,
      publicVisible: true,
    });
    await expect(
      f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        vehicleId,
        expectedRevision: 1,
        values: f.values,
      }),
    ).rejects.toThrow("FLEET_CONFLICT");
    await f.owner.mutation(api.fleet.setStatus, {
      agencyId: f.a,
      vehicleId,
      expectedRevision: 2,
      lifecycle: "archived",
    });
    await expect(
      f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        vehicleId,
        expectedRevision: 3,
        values: f.values,
      }),
    ).rejects.toThrow("FLEET_ARCHIVED");
    await f.owner.mutation(api.fleet.setStatus, {
      agencyId: f.a,
      vehicleId,
      expectedRevision: 3,
      lifecycle: "active",
    });
    expect(
      await f.owner.query(api.fleet.get, { agencyId: f.a, vehicleId }),
    ).toMatchObject({ publicVisible: false, revision: 4 });
  });
  test("catalog archives preserve history and reject new assignments", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    await f.owner.mutation(api.fleetCatalogs.setStatus, {
      agencyId: f.a,
      id: f.category,
      expectedRevision: 1,
      lifecycle: "archived",
    });
    await f.owner.mutation(api.fleet.save, {
      agencyId: f.a,
      vehicleId,
      expectedRevision: 1,
      values: { ...f.values, notes: "Preserved category" },
    });
    await expect(
      f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        expectedRevision: 0,
        values: { ...f.values, fleetNumber: "AT-002", plate: "2" },
      }),
    ).rejects.toThrow("FLEET_REFERENCE");
  });
  test("public DTO never exposes plate, VIN, costs, internal notes or tenant IDs", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    expect(
      await f.t.query(api.fleet.publicVehicle, { agencyId: f.a, vehicleId }),
    ).toBeNull();
    await f.owner.mutation(api.fleet.setVisibility, {
      agencyId: f.a,
      vehicleId,
      expectedRevision: 1,
      publicVisible: true,
    });
    const result = await f.t.query(api.fleet.publicVehicle, {
      agencyId: f.a,
      vehicleId,
    });
    expect(result?.make).toBe("Dacia");
    for (const key of [
      "plate",
      "vin",
      "notes",
      "acquisitionCost",
      "agencyId",
      "branchId",
      "fleetNumber",
    ])
      expect(result).not.toHaveProperty(key);
    await f.t.run((ctx) => ctx.db.patch(f.branch, { status: "archived" }));
    expect(
      await f.t.query(api.fleet.publicVehicle, { agencyId: f.a, vehicleId }),
    ).toBeNull();
  });
  test("paginates and applies combined indexed filters and exact identifier lookup", async () => {
    const f = await fixture();
    await f.create();
    for (let i = 2; i <= 4; i++)
      await f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        expectedRevision: 0,
        values: { ...f.values, fleetNumber: `AT-00${i}`, plate: String(i) },
      });
    const args = {
      agencyId: f.a,
      lifecycle: "active" as const,
      branchId: f.branch,
      categoryId: f.category,
      search: "",
      exact: false,
    };
    const first = await f.owner.query(api.fleet.list, {
      ...args,
      paginationOpts: page,
    });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    const next = await f.owner.query(api.fleet.list, {
      ...args,
      paginationOpts: { ...page, cursor: first.continueCursor },
    });
    expect(next.page).toHaveLength(2);
    expect(new Set([...first.page, ...next.page].map((r) => r.id)).size).toBe(
      4,
    );
    const exact = await f.owner.query(api.fleet.list, {
      ...args,
      search: "12345 a 6",
      exact: true,
      paginationOpts: page,
    });
    expect(exact.page).toHaveLength(1);
    const punctuation = await f.owner.query(api.fleet.list, {
      ...args,
      search: " - . _ ",
      exact: true,
      paginationOpts: page,
    });
    expect(punctuation.page).toEqual([]);
    await expect(
      f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        expectedRevision: 0,
        values: { ...f.values, fleetNumber: "---", plate: "other" },
      }),
    ).rejects.toThrow("INVALID_FLEET");
    const text = await f.owner.query(api.fleet.list, {
      ...args,
      search: "Sandero",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(text.page).toHaveLength(4);
  });
  test("vehicle quota is atomic and revoked membership blocks live access", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    await f.t.run(async (ctx) => {
      const counter = await ctx.db
        .query("fleetUsage")
        .withIndex("by_agency", (q) => q.eq("agencyId", f.a))
        .unique();
      await ctx.db.patch(counter!._id, { vehicles: 1000 });
    });
    await expect(
      f.owner.mutation(api.fleet.save, {
        agencyId: f.a,
        expectedRevision: 0,
        values: { ...f.values, fleetNumber: "AT-002", plate: "2" },
      }),
    ).rejects.toThrow("FLEET_LIMIT");
    await f.t.run(async (ctx) => {
      const member = await ctx.db
        .query("agencyMembers")
        .withIndex("by_agency_user", (q) =>
          q.eq("agencyId", f.a).eq("userId", f.staffId),
        )
        .unique();
      await ctx.db.patch(member!._id, { status: "revoked" });
    });
    await expect(
      f.staff.query(api.fleet.get, { agencyId: f.a, vehicleId }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
  });
});
describe("photo intent ownership and lifecycle", () => {
  test("reserves quota, prevents theft and replay, and releases expired reservations once", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    const intentId = await f.owner.mutation(api.fleetPhotos.begin, {
      agencyId: f.a,
      vehicleId,
    });
    await expect(
      f.staff.mutation(internal.fleetPhotos.acquire, { intentId }),
    ).rejects.toThrow("UPLOAD_INVALID");
    await f.owner.mutation(internal.fleetPhotos.acquire, { intentId });
    await expect(
      f.owner.mutation(internal.fleetPhotos.acquire, { intentId }),
    ).rejects.toThrow("UPLOAD_INVALID");
    await f.t.run((ctx) =>
      ctx.db.patch(intentId, { expiresAt: Date.now() - 1 }),
    );
    await f.t.mutation(internal.fleetPhotos.expire, {});
    await f.t.mutation(internal.fleetPhotos.expire, {});
    const usage = await f.t.run((ctx) =>
      ctx.db
        .query("fleetUsage")
        .withIndex("by_agency", (q) => q.eq("agencyId", f.a))
        .unique(),
    );
    expect(usage?.reservedBytes).toBe(0);
  });
  test("enforces outstanding upload and storage limits before allocation", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    for (let i = 0; i < 3; i++)
      await f.owner.mutation(api.fleetPhotos.begin, {
        agencyId: f.a,
        vehicleId,
      });
    await expect(
      f.owner.mutation(api.fleetPhotos.begin, { agencyId: f.a, vehicleId }),
    ).rejects.toThrow("UPLOAD_LIMIT");
    await f.t.run(async (ctx) => {
      const counter = await ctx.db
        .query("fleetUsage")
        .withIndex("by_agency", (q) => q.eq("agencyId", f.a))
        .unique();
      expect(counter?.reservedBytes).toBe(3 * MAX_STORED_PHOTO_BYTES);
      await ctx.db.patch(counter!._id, { bytes: STORAGE_LIMIT });
    });
    await expect(
      f.staff.mutation(api.fleetPhotos.begin, { agencyId: f.a, vehicleId }),
    ).rejects.toThrow("UPLOAD_LIMIT");
  });
  test("finalization validates stored metadata, current authority and parent lifecycle", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    const intentId = await f.owner.mutation(api.fleetPhotos.begin, {
      agencyId: f.a,
      vehicleId,
    });
    await f.owner.mutation(internal.fleetPhotos.acquire, { intentId });
    const storageId = await f.t.run((ctx) =>
      ctx.storage.store(new Blob(["not an image"], { type: "text/html" })),
    );
    await expect(
      f.owner.mutation(internal.fleetPhotos.finish, {
        intentId,
        storageId,
        alt: labels,
      }),
    ).rejects.toThrow("UPLOAD_INVALID");
    await f.owner.mutation(api.fleet.setStatus, {
      agencyId: f.a,
      vehicleId,
      expectedRevision: 1,
      lifecycle: "archived",
    });
    await expect(
      f.owner.mutation(internal.fleetPhotos.finish, {
        intentId,
        storageId,
        alt: labels,
      }),
    ).rejects.toThrow("UPLOAD_INVALID");
  });
  test("valid finalization links one photo, updates counters and removal releases bytes", async () => {
    const f = await fixture();
    const vehicleId = await f.create();
    const intentId = await f.owner.mutation(api.fleetPhotos.begin, {
      agencyId: f.a,
      vehicleId,
    });
    await f.owner.mutation(internal.fleetPhotos.acquire, { intentId });
    // Internal finalizer trusts only the server decoder's registered hash.
    const storageId = await f.t.run((ctx) =>
      ctx.storage.store(
        new Blob(["decoded test bytes"], { type: "image/webp" }),
      ),
    );
    // convex-test 0.0.56 omits the Blob MIME type from its storage metadata.
    // Supply that missing platform field only in this test fixture.
    await f.t.run(async (ctx) => {
      const system =
        ctx.db as unknown as GenericDatabaseWriter<SystemDataModel>;
      await system.patch(storageId, { contentType: "image/webp" });
    });
    const metadata = await f.t.run((ctx) => ctx.db.system.get(storageId));
    await f.owner.mutation(internal.fleetPhotos.registerHash, {
      intentId,
      hash: metadata!.sha256,
    });
    await f.owner.mutation(internal.fleetPhotos.finish, {
      intentId,
      storageId,
      alt: labels,
    });
    await expect(
      f.owner.mutation(internal.fleetPhotos.finish, {
        intentId,
        storageId,
        alt: labels,
      }),
    ).rejects.toThrow("UPLOAD_INVALID");
    const photos = await f.owner.query(api.fleetPhotos.list, {
      agencyId: f.a,
      vehicleId,
    });
    expect(photos).toHaveLength(1);
    await f.owner.mutation(api.fleetPhotos.edit, {
      agencyId: f.a,
      vehicleId,
      expectedRevision: 2,
      imageId: photos[0]!.id,
      move: "remove",
      alt: labels,
    });
    const counter = await f.t.run((ctx) =>
      ctx.db
        .query("fleetUsage")
        .withIndex("by_agency", (q) => q.eq("agencyId", f.a))
        .unique(),
    );
    expect(counter).toMatchObject({ bytes: 0, reservedBytes: 0 });
    expect(await f.t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
  });
});
