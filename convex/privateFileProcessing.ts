"use node";

import { createHash } from "node:crypto";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { processPrivateDocument } from "./lib/processPrivateDocument";

const processingInput = makeFunctionReference<
  "query",
  { intentId: Id<"privateUploadIntents"> },
  { sourceStorageId: Id<"_storage">; sourceHash: string }
>("privateFiles:processingInput");

const registerBlob = makeFunctionReference<
  "mutation",
  {
    intentId: Id<"privateUploadIntents">;
    hash: string;
    kind: "page";
    position: number;
  },
  Id<"privateFileBlobs">
>("privateFiles:registerBlob");

const attachBlob = makeFunctionReference<
  "mutation",
  { registryId: Id<"privateFileBlobs">; storageId: Id<"_storage"> },
  null
>("privateFiles:attachBlob");

const finish = makeFunctionReference<
  "mutation",
  {
    intentId: Id<"privateUploadIntents">;
    pages: Array<{
      registryId: Id<"privateFileBlobs">;
      storageId: Id<"_storage">;
    }>;
  },
  Id<"files">
>("privateFiles:finish");

const failProcessing = makeFunctionReference<
  "mutation",
  { intentId: Id<"privateUploadIntents"> },
  null
>("privateFiles:failProcessing");

export const process = internalAction({
  args: { intentId: v.id("privateUploadIntents") },
  returns: v.null(),
  handler: async (ctx, { intentId }) => {
    try {
      const input = await ctx.runQuery(processingInput, { intentId });
      const source = await ctx.storage.get(input.sourceStorageId);
      if (!source) throw new Error("PRIVATE_FILE_INVALID");
      const pages = await processPrivateDocument(await source.arrayBuffer());
      const stored = [];
      for (let position = 0; position < pages.length; position += 1) {
        const page = pages[position]!;
        const hash = createHash("sha256").update(page.bytes).digest("base64");
        const registryId = await ctx.runMutation(registerBlob, {
          intentId,
          hash,
          kind: "page",
          position,
        });
        const storageId = await ctx.storage.store(
          new Blob([new Uint8Array(page.bytes)], { type: "image/webp" }),
          { sha256: hash },
        );
        await ctx.runMutation(attachBlob, { registryId, storageId });
        stored.push({ registryId, storageId });
      }
      await ctx.runMutation(finish, { intentId, pages: stored });
      return null;
    } catch {
      await ctx.runMutation(failProcessing, { intentId });
      throw new ConvexError("PRIVATE_FILE_INVALID");
    }
  },
});
