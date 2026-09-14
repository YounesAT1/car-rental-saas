import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { labels } from "./lib/fleetValidators";
import {
  checkRevision,
  fleetAccess,
  fleetAudit,
  ownedVehicle,
  usage,
} from "./lib/fleet";
import {
  labelsSchema,
  MAX_PHOTOS,
  MAX_STORED_PHOTO_BYTES,
  STORAGE_LIMIT,
} from "../src/lib/fleet";

const ownerArgs = { agencyId: v.id("agencies"), vehicleId: v.id("vehicles") };
async function images(
  ctx: MutationCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
) {
  return ctx.db
    .query("vehicleImages")
    .withIndex("by_agency_vehicle", (q) =>
      q.eq("agencyId", agencyId).eq("vehicleId", vehicleId),
    )
    .take(MAX_PHOTOS);
}
async function release(ctx: MutationCtx, intent: Doc<"fleetUploadIntents">) {
  if (intent.status === "done" || intent.status === "failed") return;
  const counter = await usage(ctx, intent.agencyId);
  await ctx.db.patch(counter._id, {
    reservedBytes: Math.max(0, counter.reservedBytes - intent.reservedBytes),
  });
  await ctx.db.patch(intent._id, { status: "failed" });
}
export const list = query({
  args: ownerArgs,
  returns: v.array(
    v.object({
      id: v.id("vehicleImages"),
      url: v.string(),
      alt: labels,
      position: v.number(),
    }),
  ),
  handler: async (ctx, { agencyId, vehicleId }) => {
    await fleetAccess(ctx, agencyId);
    await ownedVehicle(ctx, agencyId, vehicleId);
    const rows = await ctx.db
      .query("vehicleImages")
      .withIndex("by_agency_vehicle", (q) =>
        q.eq("agencyId", agencyId).eq("vehicleId", vehicleId),
      )
      .take(MAX_PHOTOS);
    const result = [];
    for (const r of rows) {
      const file = await ctx.db.get(r.fileId);
      if (file) {
        const url = await ctx.storage.getUrl(file.storageId);
        if (url)
          result.push({ id: r._id, url, alt: r.alt, position: r.position });
      }
    }
    return result;
  },
});
export const begin = mutation({
  args: ownerArgs,
  returns: v.id("fleetUploadIntents"),
  handler: async (ctx, { agencyId, vehicleId }) => {
    const { user } = await fleetAccess(ctx, agencyId, "vehicle.update");
    const vehicle = await ownedVehicle(ctx, agencyId, vehicleId);
    if (vehicle.lifecycle !== "active") throw new ConvexError("FLEET_ARCHIVED");
    const recent = await ctx.db
      .query("fleetUploadIntents")
      .withIndex("by_agency_actor", (q) =>
        q.eq("agencyId", agencyId).eq("actorId", user._id),
      )
      .order("desc")
      .take(31);
    if (
      recent.filter((r) => r._creationTime > Date.now() - 3600000).length >=
        30 ||
      recent.filter(
        (r) =>
          (r.status === "pending" || r.status === "processing") &&
          r.expiresAt > Date.now(),
      ).length >= 3
    )
      throw new ConvexError("UPLOAD_LIMIT");
    const current = await images(ctx, agencyId, vehicleId);
    const pending = await ctx.db
      .query("fleetUploadIntents")
      .withIndex("by_agency_vehicle", (q) =>
        q.eq("agencyId", agencyId).eq("vehicleId", vehicleId),
      )
      .order("desc")
      .take(100);
    if (
      current.length +
        pending.filter(
          (r) =>
            (r.status === "pending" || r.status === "processing") &&
            r.expiresAt > Date.now(),
        ).length >=
      MAX_PHOTOS
    )
      throw new ConvexError("UPLOAD_LIMIT");
    const counter = await usage(ctx, agencyId);
    if (
      counter.bytes + counter.reservedBytes + MAX_STORED_PHOTO_BYTES >
      STORAGE_LIMIT
    )
      throw new ConvexError("UPLOAD_LIMIT");
    await ctx.db.patch(counter._id, {
      reservedBytes: counter.reservedBytes + MAX_STORED_PHOTO_BYTES,
    });
    return ctx.db.insert("fleetUploadIntents", {
      agencyId,
      vehicleId,
      actorId: user._id,
      status: "pending",
      expiresAt: Date.now() + 600000,
      reservedBytes: MAX_STORED_PHOTO_BYTES,
    });
  },
});
export const acquire = internalMutation({
  args: { intentId: v.id("fleetUploadIntents") },
  returns: v.null(),
  handler: async (ctx, { intentId }) => {
    const intent = await ctx.db.get(intentId);
    if (!intent) throw new ConvexError("UPLOAD_INVALID");
    const { user } = await fleetAccess(ctx, intent.agencyId, "vehicle.update");
    const vehicle = await ownedVehicle(ctx, intent.agencyId, intent.vehicleId);
    if (
      user._id !== intent.actorId ||
      intent.status !== "pending" ||
      intent.expiresAt < Date.now() ||
      vehicle.lifecycle !== "active"
    )
      throw new ConvexError("UPLOAD_INVALID");
    await ctx.db.patch(intentId, { status: "processing" });
    return null;
  },
});
export const registerHash = internalMutation({
  args: { intentId: v.id("fleetUploadIntents"), hash: v.string() },
  returns: v.null(),
  handler: async (ctx, { intentId, hash }) => {
    const intent = await ctx.db.get(intentId);
    if (
      !intent ||
      intent.status !== "processing" ||
      intent.expiresAt < Date.now()
    )
      throw new ConvexError("UPLOAD_INVALID");
    await ctx.db.patch(intentId, { processedHash: hash });
    return null;
  },
});
export const finish = internalMutation({
  args: {
    intentId: v.id("fleetUploadIntents"),
    storageId: v.id("_storage"),
    alt: labels,
  },
  returns: v.null(),
  handler: async (ctx, { intentId, storageId, alt }) => {
    const intent = await ctx.db.get(intentId);
    if (!intent) throw new ConvexError("UPLOAD_INVALID");
    const { user } = await fleetAccess(ctx, intent.agencyId, "vehicle.update");
    const vehicle = await ownedVehicle(ctx, intent.agencyId, intent.vehicleId);
    if (
      intent.actorId !== user._id ||
      intent.status !== "processing" ||
      intent.expiresAt < Date.now() ||
      vehicle.lifecycle !== "active"
    )
      throw new ConvexError("UPLOAD_INVALID");
    const metadata = await ctx.db.system.get(storageId);
    if (
      !metadata ||
      metadata.contentType !== "image/webp" ||
      metadata.size > MAX_STORED_PHOTO_BYTES ||
      metadata.sha256 !== intent.processedHash ||
      !labelsSchema.safeParse(alt).success
    )
      throw new ConvexError("UPLOAD_INVALID");
    const rows = await images(ctx, intent.agencyId, intent.vehicleId);
    if (rows.length >= MAX_PHOTOS) throw new ConvexError("UPLOAD_LIMIT");
    const fileId = await ctx.db.insert("fleetFiles", {
      agencyId: intent.agencyId,
      vehicleId: intent.vehicleId,
      storageId,
      bytes: metadata.size,
      intentId,
    });
    await ctx.db.insert("vehicleImages", {
      agencyId: intent.agencyId,
      vehicleId: intent.vehicleId,
      fileId,
      position: rows.length,
      alt,
    });
    const counter = await usage(ctx, intent.agencyId);
    await ctx.db.patch(counter._id, {
      reservedBytes: counter.reservedBytes - intent.reservedBytes,
      bytes: counter.bytes + metadata.size,
    });
    await ctx.db.patch(intentId, { status: "done", storageId });
    await ctx.db.patch(vehicle._id, {
      revision: vehicle.revision + 1,
      updatedAt: Date.now(),
    });
    await fleetAudit(
      ctx,
      intent.agencyId,
      user._id,
      "photo.added",
      vehicle._id,
    );
    return null;
  },
});
export const fail = internalMutation({
  args: {
    intentId: v.id("fleetUploadIntents"),
    storageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, { intentId, storageId }) => {
    const intent = await ctx.db.get(intentId);
    // An uncertain finish response must never delete a successfully linked photo.
    if (intent?.status === "done") return null;
    if (storageId) {
      const linked = await ctx.db
        .query("fleetFiles")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .unique();
      if (!linked) await ctx.storage.delete(storageId);
    }
    if (intent) await release(ctx, intent);
    return null;
  },
});
export const edit = mutation({
  args: {
    ...ownerArgs,
    expectedRevision: v.number(),
    imageId: v.id("vehicleImages"),
    alt: labels,
    move: v.union(
      v.literal("none"),
      v.literal("first"),
      v.literal("up"),
      v.literal("down"),
      v.literal("remove"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(ctx, args.agencyId, "vehicle.update");
    const vehicle = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    checkRevision(vehicle, args.expectedRevision);
    if (vehicle.lifecycle !== "active") throw new ConvexError("FLEET_ARCHIVED");
    const rows = await images(ctx, args.agencyId, args.vehicleId);
    const index = rows.findIndex((r) => r._id === args.imageId);
    if (index < 0) throw new ConvexError("UPLOAD_INVALID");
    const image = rows[index]!;
    if (args.move === "remove") {
      const file = await ctx.db.get(image.fileId);
      if (file) {
        await ctx.storage.delete(file.storageId);
        await ctx.db.delete(file._id);
        const counter = await usage(ctx, args.agencyId);
        await ctx.db.patch(counter._id, {
          bytes: Math.max(0, counter.bytes - file.bytes),
        });
      }
      await ctx.db.delete(image._id);
      rows.splice(index, 1);
    } else {
      if (!labelsSchema.safeParse(args.alt).success)
        throw new ConvexError("INVALID_FLEET");
      await ctx.db.patch(image._id, { alt: args.alt });
      const to =
        args.move === "first"
          ? 0
          : args.move === "up"
            ? Math.max(0, index - 1)
            : args.move === "down"
              ? Math.min(rows.length - 1, index + 1)
              : index;
      rows.splice(index, 1);
      rows.splice(to, 0, image);
    }
    for (let i = 0; i < rows.length; i++)
      await ctx.db.patch(rows[i]!._id, { position: i });
    await ctx.db.patch(vehicle._id, {
      revision: vehicle.revision + 1,
      updatedAt: Date.now(),
    });
    await fleetAudit(
      ctx,
      args.agencyId,
      user._id,
      `photo.${args.move}`,
      vehicle._id,
    );
    return null;
  },
});
export const expire = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const status of ["pending", "processing"] as const) {
      const rows = await ctx.db
        .query("fleetUploadIntents")
        .withIndex("by_status_expiry", (q) =>
          q.eq("status", status).lt("expiresAt", Date.now()),
        )
        .take(100);
      for (const row of rows) await release(ctx, row);
    }
    return null;
  },
});
// Only blobs whose hash was registered by our decoder can be reclaimed. Never
// delete unrelated storage. Each scheduled page is bounded and older than an hour.
export const sweep = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.system
      .query("_storage")
      .order("asc")
      .paginate({ cursor, numItems: 50 });
    for (const blob of page.page) {
      if (blob._creationTime > Date.now() - 3600000) continue;
      const intent = await ctx.db
        .query("fleetUploadIntents")
        .withIndex("by_hash", (q) => q.eq("processedHash", blob.sha256))
        .first();
      if (!intent || intent.expiresAt > Date.now()) continue;
      const file = await ctx.db
        .query("fleetFiles")
        .withIndex("by_storage", (q) => q.eq("storageId", blob._id))
        .unique();
      if (!file) await ctx.storage.delete(blob._id);
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(1000, internal.fleetPhotos.sweep, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
