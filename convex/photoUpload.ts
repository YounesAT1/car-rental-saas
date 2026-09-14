"use node";
import { createHash } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { labels } from "./lib/fleetValidators";
import { processPhoto } from "./lib/processPhoto";
import { labelsSchema } from "../src/lib/fleet";
import type { Id } from "./_generated/dataModel";
export const upload = action({
  args: { intentId: v.id("fleetUploadIntents"), bytes: v.bytes(), alt: labels },
  returns: v.null(),
  handler: async (ctx, { intentId, bytes, alt }): Promise<null> => {
    // Acquire outside the catch: a replay must not release another running request.
    await ctx.runMutation(internal.fleetPhotos.acquire, { intentId });
    let storageId: Id<"_storage"> | undefined;
    try {
      if (!labelsSchema.safeParse(alt).success)
        throw new Error("UPLOAD_INVALID");
      const output = await processPhoto(bytes);
      await ctx.runMutation(internal.fleetPhotos.registerHash, {
        intentId,
        hash: createHash("sha256").update(output).digest("base64"),
      });
      storageId = await ctx.storage.store(
        new Blob([new Uint8Array(output)], { type: "image/webp" }),
      );
      await ctx.runMutation(internal.fleetPhotos.finish, {
        intentId,
        storageId,
        alt,
      });
      return null;
    } catch {
      await ctx.runMutation(internal.fleetPhotos.fail, { intentId, storageId });
      throw new ConvexError("UPLOAD_INVALID");
    }
  },
});
