import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertPrivateQuota,
  authorizePrivateOwner,
  authorizeStoredActor,
  privateOwnerKey,
  privateUsage,
} from "./lib/privateFiles";
import {
  fail,
  operationAudit,
  refreshReadiness,
  revision,
} from "./lib/operations";
import { fileOwner } from "./lib/operationsValidators";
import {
  PRIVATE_OUTPUT_LIMIT,
  PRIVATE_PAGE_LIMIT,
  PRIVATE_SOURCE_LIMIT,
} from "../src/lib/operations";

const processIntent = makeFunctionReference<
  "action",
  { intentId: Id<"privateUploadIntents"> },
  null
>("privateFileProcessing:process");

const sweepPrivateBlobs = makeFunctionReference<
  "mutation",
  { cursor: string | null },
  null
>("privateFiles:sweep");

const fileSummary = v.object({
  id: v.id("files"),
  recordedAt: v.number(),
  pageCount: v.number(),
  bytes: v.number(),
});

const pageSummary = v.object({
  id: v.id("privateFilePages"),
  position: v.number(),
  bytes: v.number(),
});

async function releaseIntent(
  ctx: Parameters<typeof privateUsage>[0],
  intent: Doc<"privateUploadIntents">,
) {
  if (intent.status === "done" || intent.status === "failed") return;
  const blobs = await ctx.db
    .query("privateFileBlobs")
    .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
    .take(PRIVATE_PAGE_LIMIT + 2);
  if (blobs.length > PRIVATE_PAGE_LIMIT + 1) fail("OPERATIONS_LIMIT");
  for (const blob of blobs) {
    if (blob.storageId) await ctx.storage.delete(blob.storageId);
    await ctx.db.delete(blob._id);
  }
  const usage = await privateUsage(ctx, intent.agencyId);
  await ctx.db.patch(usage._id, {
    reservedBytes: Math.max(0, usage.reservedBytes - intent.reservedBytes),
  });
  await ctx.db.patch(intent._id, { status: "failed" });
}

export const begin = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    owner: fileOwner,
    expectedRevision: v.number(),
  },
  returns: v.id("privateUploadIntents"),
  handler: async (ctx, args) => {
    const { user, record } = await authorizePrivateOwner(
      ctx,
      args.agencyId,
      args.vehicleId,
      args.owner,
      true,
    );
    revision(record, args.expectedRevision);
    const pending = await ctx.db
      .query("privateUploadIntents")
      .withIndex("by_agency_actor", (q) =>
        q
          .eq("agencyId", args.agencyId)
          .eq("actorId", user._id)
          .eq("status", "pending"),
      )
      .take(3);
    const processing = await ctx.db
      .query("privateUploadIntents")
      .withIndex("by_agency_actor", (q) =>
        q
          .eq("agencyId", args.agencyId)
          .eq("actorId", user._id)
          .eq("status", "processing"),
      )
      .take(3);
    if (
      [...pending, ...processing].filter((row) => row.expiresAt > Date.now())
        .length >= 2
    )
      fail("PRIVATE_FILE_LIMIT");
    const usage = await privateUsage(ctx, args.agencyId);
    assertPrivateQuota(usage);
    await ctx.db.patch(usage._id, {
      reservedBytes: usage.reservedBytes + PRIVATE_OUTPUT_LIMIT,
    });
    return ctx.db.insert("privateUploadIntents", {
      agencyId: args.agencyId,
      vehicleId: args.vehicleId,
      actorId: user._id,
      owner: args.owner,
      ownerKey: privateOwnerKey(args.owner),
      expectedRevision: args.expectedRevision,
      status: "pending",
      expiresAt: Date.now() + 10 * 60_000,
      reservedBytes: PRIVATE_OUTPUT_LIMIT,
      registeredHashes: [],
    });
  },
});

export const status = query({
  args: { intentId: v.id("privateUploadIntents") },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("done"),
        v.literal("failed"),
      ),
      fileId: v.union(v.id("files"), v.null()),
    }),
  ),
  handler: async (ctx, { intentId }) => {
    const intent = await ctx.db.get(intentId);
    if (!intent) return null;
    const { user } = await authorizePrivateOwner(
      ctx,
      intent.agencyId,
      intent.vehicleId,
      intent.owner,
      false,
    );
    if (intent.actorId !== user._id) fail("PERMISSION_DENIED");
    return { status: intent.status, fileId: intent.fileId ?? null };
  },
});

export const list = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    owner: fileOwner,
  },
  returns: v.array(fileSummary),
  handler: async (ctx, args) => {
    await authorizePrivateOwner(
      ctx,
      args.agencyId,
      args.vehicleId,
      args.owner,
      false,
    );
    const rows = await ctx.db
      .query("files")
      .withIndex("by_agency_owner", (q) =>
        q
          .eq("agencyId", args.agencyId)
          .eq("ownerKey", privateOwnerKey(args.owner)),
      )
      .take(51);
    if (rows.length > 50) fail("OPERATIONS_LIMIT");
    return rows.map((row) => ({
      id: row._id,
      recordedAt: row.recordedAt,
      pageCount: row.pageCount,
      bytes: row.bytes,
    }));
  },
});

export const manifest = query({
  args: { agencyId: v.id("agencies"), fileId: v.id("files") },
  returns: v.union(v.null(), v.array(pageSummary)),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.agencyId !== args.agencyId) return null;
    await authorizePrivateOwner(
      ctx,
      file.agencyId,
      file.vehicleId,
      file.owner,
      false,
    );
    const pages = await ctx.db
      .query("privateFilePages")
      .withIndex("by_file_position", (q) => q.eq("fileId", file._id))
      .take(PRIVATE_PAGE_LIMIT + 1);
    if (pages.length !== file.pageCount) fail("PRIVATE_FILE_INVALID");
    return pages.map((page) => ({
      id: page._id,
      position: page.position,
      bytes: page.bytes,
    }));
  },
});

export const acquire = internalMutation({
  args: { intentId: v.id("privateUploadIntents") },
  returns: v.null(),
  handler: async (ctx, { intentId }) => {
    const intent = await ctx.db.get(intentId);
    if (!intent) fail("PRIVATE_FILE_INVALID");
    const { user, record } = await authorizePrivateOwner(
      ctx,
      intent.agencyId,
      intent.vehicleId,
      intent.owner,
      true,
    );
    if (
      user._id !== intent.actorId ||
      intent.status !== "pending" ||
      intent.expiresAt <= Date.now()
    )
      fail("PRIVATE_FILE_INVALID");
    revision(record, intent.expectedRevision);
    await ctx.db.patch(intent._id, { status: "processing" });
    return null;
  },
});

export const registerBlob = internalMutation({
  args: {
    intentId: v.id("privateUploadIntents"),
    hash: v.string(),
    kind: v.union(v.literal("source"), v.literal("page")),
    position: v.optional(v.number()),
  },
  returns: v.id("privateFileBlobs"),
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (
      !intent ||
      intent.status !== "processing" ||
      intent.expiresAt <= Date.now() ||
      !/^[A-Za-z0-9+/]{43}=$/.test(args.hash)
    )
      fail("PRIVATE_FILE_INVALID");
    if (
      (args.kind === "source" && args.position !== undefined) ||
      (args.kind === "page" &&
        (args.position === undefined ||
          !Number.isSafeInteger(args.position) ||
          args.position < 0 ||
          args.position >= PRIVATE_PAGE_LIMIT))
    )
      fail("PRIVATE_FILE_INVALID");
    const blobs = await ctx.db
      .query("privateFileBlobs")
      .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
      .take(PRIVATE_PAGE_LIMIT + 2);
    if (blobs.length > PRIVATE_PAGE_LIMIT) fail("PRIVATE_FILE_LIMIT");
    const duplicate = blobs.find(
      (blob) => blob.kind === args.kind && blob.position === args.position,
    );
    if (duplicate) {
      if (duplicate.hash !== args.hash) fail("PRIVATE_FILE_INVALID");
      return duplicate._id;
    }
    const registeredHashes = intent.registeredHashes.includes(args.hash)
      ? intent.registeredHashes
      : [...intent.registeredHashes, args.hash];
    if (registeredHashes.length > PRIVATE_PAGE_LIMIT + 1)
      fail("PRIVATE_FILE_LIMIT");
    await ctx.db.patch(intent._id, { registeredHashes });
    return ctx.db.insert("privateFileBlobs", {
      agencyId: intent.agencyId,
      intentId: intent._id,
      hash: args.hash,
      kind: args.kind,
      position: args.position,
      state: "registered",
    });
  },
});

export const attachBlob = internalMutation({
  args: {
    registryId: v.id("privateFileBlobs"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const registry = await ctx.db.get(args.registryId);
    if (!registry || registry.state !== "registered")
      fail("PRIVATE_FILE_INVALID");
    const intent = await ctx.db.get(registry.intentId);
    const metadata = await ctx.db.system.get(args.storageId);
    if (
      !intent ||
      intent.status !== "processing" ||
      intent.expiresAt <= Date.now() ||
      !metadata ||
      metadata.sha256 !== registry.hash ||
      (registry.kind === "source" && metadata.size > PRIVATE_SOURCE_LIMIT) ||
      (registry.kind === "page" &&
        (metadata.contentType !== "image/webp" || metadata.size > 1024 * 1024))
    )
      fail("PRIVATE_FILE_INVALID");
    await ctx.db.patch(registry._id, {
      storageId: args.storageId,
      state: "stored",
    });
    if (registry.kind === "source") {
      await ctx.db.patch(intent._id, {
        sourceStorageId: args.storageId,
        sourceHash: registry.hash,
      });
      await ctx.scheduler.runAfter(0, processIntent, { intentId: intent._id });
    }
    return null;
  },
});

export const processingInput = internalQuery({
  args: { intentId: v.id("privateUploadIntents") },
  returns: v.object({
    sourceStorageId: v.id("_storage"),
    sourceHash: v.string(),
  }),
  handler: async (ctx, { intentId }) => {
    const intent = await ctx.db.get(intentId);
    if (
      !intent ||
      intent.status !== "processing" ||
      intent.expiresAt <= Date.now() ||
      !intent.sourceStorageId ||
      !intent.sourceHash
    )
      fail("PRIVATE_FILE_INVALID");
    return {
      sourceStorageId: intent.sourceStorageId,
      sourceHash: intent.sourceHash,
    };
  },
});

export const finish = internalMutation({
  args: {
    intentId: v.id("privateUploadIntents"),
    pages: v.array(
      v.object({
        registryId: v.id("privateFileBlobs"),
        storageId: v.id("_storage"),
      }),
    ),
  },
  returns: v.id("files"),
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (
      !intent ||
      intent.status !== "processing" ||
      intent.expiresAt <= Date.now() ||
      !intent.sourceStorageId ||
      !intent.sourceHash ||
      args.pages.length < 1 ||
      args.pages.length > PRIVATE_PAGE_LIMIT
    )
      fail("PRIVATE_FILE_INVALID");
    const { record } = await authorizeStoredActor(ctx, intent);
    revision(record, intent.expectedRevision);
    const existing = await ctx.db
      .query("files")
      .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
      .unique();
    if (existing) return existing._id;
    let total = 0;
    const checked = [];
    for (let position = 0; position < args.pages.length; position += 1) {
      const page = args.pages[position]!;
      const registry = await ctx.db.get(page.registryId);
      const metadata = await ctx.db.system.get(page.storageId);
      if (
        !registry ||
        registry.intentId !== intent._id ||
        registry.kind !== "page" ||
        registry.position !== position ||
        registry.storageId !== page.storageId ||
        registry.state !== "stored" ||
        !metadata ||
        metadata.contentType !== "image/webp" ||
        metadata.sha256 !== registry.hash ||
        metadata.size > 1024 * 1024
      )
        fail("PRIVATE_FILE_INVALID");
      total += metadata.size;
      if (total > PRIVATE_OUTPUT_LIMIT) fail("PRIVATE_FILE_LIMIT");
      checked.push({
        registry,
        storageId: page.storageId,
        bytes: metadata.size,
      });
    }
    const fileId = await ctx.db.insert("files", {
      agencyId: intent.agencyId,
      vehicleId: intent.vehicleId,
      owner: intent.owner,
      ownerKey: intent.ownerKey,
      actorId: intent.actorId,
      intentId: intent._id,
      recordedAt: Date.now(),
      pageCount: checked.length,
      bytes: total,
      sourceHash: intent.sourceHash,
    });
    for (let position = 0; position < checked.length; position += 1) {
      const page = checked[position]!;
      await ctx.db.insert("privateFilePages", {
        agencyId: intent.agencyId,
        intentId: intent._id,
        fileId,
        position,
        storageId: page.storageId,
        bytes: page.bytes,
      });
      await ctx.db.patch(page.registry._id, { state: "linked" });
    }
    if (intent.owner.kind === "document") {
      const document = await ctx.db.get(intent.owner.id);
      if (!document || document.status !== "draft") fail("PRIVATE_FILE_LOCKED");
      const current = await ctx.db
        .query("vehicleDocuments")
        .withIndex("by_agency_vehicle_type_status", (q) =>
          q
            .eq("agencyId", intent.agencyId)
            .eq("vehicleId", intent.vehicleId)
            .eq("typeId", document.typeId)
            .eq("status", "current"),
        )
        .unique();
      if (current)
        await ctx.db.patch(current._id, {
          status: "superseded",
          revision: current.revision + 1,
        });
      await ctx.db.patch(document._id, {
        fileId,
        status: "current",
        supersedesId: current?._id,
        revision: document.revision + 1,
      });
      await refreshReadiness(
        ctx,
        intent.agencyId,
        intent.vehicleId,
        intent.actorId,
      );
    }
    const usage = await privateUsage(ctx, intent.agencyId);
    await ctx.db.patch(usage._id, {
      bytes: usage.bytes + total,
      reservedBytes: Math.max(0, usage.reservedBytes - intent.reservedBytes),
    });
    await ctx.storage.delete(intent.sourceStorageId);
    const registries = await ctx.db
      .query("privateFileBlobs")
      .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
      .take(PRIVATE_PAGE_LIMIT + 1);
    const sourceRegistry = registries.find((row) => row.kind === "source");
    if (sourceRegistry)
      await ctx.db.patch(sourceRegistry._id, { state: "linked" });
    await ctx.db.patch(intent._id, { status: "done", fileId });
    await operationAudit(
      ctx,
      intent.agencyId,
      intent.actorId,
      "private_file.published",
      fileId,
    );
    return fileId;
  },
});

export const failProcessing = internalMutation({
  args: { intentId: v.id("privateUploadIntents") },
  returns: v.null(),
  handler: async (ctx, { intentId }) => {
    const intent = await ctx.db.get(intentId);
    if (intent) await releaseIntent(ctx, intent);
    return null;
  },
});

export const expire = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const status of ["pending", "processing"] as const) {
      const intents = await ctx.db
        .query("privateUploadIntents")
        .withIndex("by_status_expiry", (q) =>
          q.eq("status", status).lt("expiresAt", Date.now()),
        )
        .take(100);
      for (const intent of intents) await releaseIntent(ctx, intent);
    }
    return null;
  },
});

export const sweep = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.system
      .query("_storage")
      .order("asc")
      .paginate({ cursor, numItems: 50 });
    for (const stored of page.page) {
      if (stored._creationTime > Date.now() - 60 * 60_000) continue;
      const privatePage = await ctx.db
        .query("privateFilePages")
        .withIndex("by_storage", (q) => q.eq("storageId", stored._id))
        .unique();
      const publicFile = await ctx.db
        .query("fleetFiles")
        .withIndex("by_storage", (q) => q.eq("storageId", stored._id))
        .unique();
      if (privatePage || publicFile) continue;
      const attached = await ctx.db
        .query("privateFileBlobs")
        .withIndex("by_storage", (q) => q.eq("storageId", stored._id))
        .unique();
      if (attached) {
        const intent = await ctx.db.get(attached.intentId);
        if (
          intent?.status === "done" ||
          (intent &&
            intent.status !== "failed" &&
            intent.expiresAt > Date.now())
        )
          continue;
        await ctx.storage.delete(stored._id);
        await ctx.db.delete(attached._id);
        continue;
      }
      const activeFleetIntent = await ctx.db
        .query("fleetUploadIntents")
        .withIndex("by_hash", (q) => q.eq("processedHash", stored.sha256))
        .first();
      if (
        activeFleetIntent &&
        activeFleetIntent.status !== "done" &&
        activeFleetIntent.status !== "failed" &&
        activeFleetIntent.expiresAt > Date.now()
      )
        continue;
      const registrations = await ctx.db
        .query("privateFileBlobs")
        .withIndex("by_hash", (q) => q.eq("hash", stored.sha256))
        .take(25);
      const abandoned = [];
      for (const registration of registrations) {
        if (registration.storageId) continue;
        const intent = await ctx.db.get(registration.intentId);
        if (
          intent &&
          (intent.status === "failed" || intent.expiresAt <= Date.now())
        )
          abandoned.push(registration);
      }
      if (abandoned.length === 0) continue;
      await ctx.storage.delete(stored._id);
      for (const registration of abandoned)
        await ctx.db.delete(registration._id);
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(1000, sweepPrivateBlobs, {
        cursor: page.continueCursor,
      });
    return null;
  },
});

export const authorizeDownload = internalMutation({
  args: {
    fileId: v.id("files"),
    pageId: v.id("privateFilePages"),
  },
  returns: v.object({ storageId: v.id("_storage"), filename: v.string() }),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    const page = await ctx.db.get(args.pageId);
    if (!file || !page || page.fileId !== file._id)
      fail("PRIVATE_FILE_NOT_FOUND");
    const { user } = await authorizePrivateOwner(
      ctx,
      file.agencyId,
      file.vehicleId,
      file.owner,
      false,
    );
    await operationAudit(
      ctx,
      file.agencyId,
      user._id,
      "private_file.read",
      page._id,
    );
    return {
      storageId: page.storageId,
      filename: `evidence-${file._id}-page-${page.position + 1}.webp`,
    };
  },
});
