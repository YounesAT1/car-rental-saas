import { makeFunctionReference } from "convex/server";
import { httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { PRIVATE_SOURCE_LIMIT } from "../src/lib/operations";

const acquire = makeFunctionReference<
  "mutation",
  { intentId: Id<"privateUploadIntents"> },
  null
>("privateFiles:acquire");

const registerBlob = makeFunctionReference<
  "mutation",
  {
    intentId: Id<"privateUploadIntents">;
    hash: string;
    kind: "source";
  },
  Id<"privateFileBlobs">
>("privateFiles:registerBlob");

const attachBlob = makeFunctionReference<
  "mutation",
  { registryId: Id<"privateFileBlobs">; storageId: Id<"_storage"> },
  null
>("privateFiles:attachBlob");

const failProcessing = makeFunctionReference<
  "mutation",
  { intentId: Id<"privateUploadIntents"> },
  null
>("privateFiles:failProcessing");

const authorizeDownload = makeFunctionReference<
  "mutation",
  { fileId: Id<"files">; pageId: Id<"privateFilePages"> },
  { storageId: Id<"_storage">; filename: string }
>("privateFiles:authorizeDownload");

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return { origin: null, allowed: true };
  const origins = (process.env.PRIVATE_FILE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return { origin, allowed: origins.includes(origin) };
}

function responseHeaders(request: Request) {
  const { origin, allowed } = allowedOrigin(request);
  if (!allowed) return null;
  const headers = new Headers({
    Vary: "Origin",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "600",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

async function readBoundedBody(request: Request) {
  if (!request.body) throw new Error("PRIVATE_FILE_INVALID");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > PRIVATE_SOURCE_LIMIT) {
      await reader.cancel();
      throw new Error("PRIVATE_FILE_LIMIT");
    }
    chunks.push(value);
  }
  if (total === 0) throw new Error("PRIVATE_FILE_INVALID");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function sha256(bytes: Uint8Array) {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", input.buffer),
  );
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pathParts(request: Request) {
  return new URL(request.url).pathname.split("/").filter(Boolean);
}

export const options = httpAction(async (_ctx, request) => {
  const headers = responseHeaders(request);
  return headers
    ? new Response(null, { status: 204, headers })
    : new Response("Forbidden", { status: 403 });
});

export const upload = httpAction(async (ctx, request) => {
  const headers = responseHeaders(request);
  if (!headers) return new Response("Forbidden", { status: 403 });
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return new Response("Unauthorized", { status: 401, headers });
  const intentId = pathParts(request).at(-1) as
    Id<"privateUploadIntents"> | undefined;
  if (!intentId) return new Response("Not found", { status: 404, headers });
  let acquired = false;
  try {
    const bytes = await readBoundedBody(request);
    await ctx.runMutation(acquire, { intentId });
    acquired = true;
    const hash = await sha256(bytes);
    const registryId = await ctx.runMutation(registerBlob, {
      intentId,
      hash,
      kind: "source",
    });
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: "application/octet-stream" }),
      { sha256: hash },
    );
    await ctx.runMutation(attachBlob, { registryId, storageId });
    headers.set("Cache-Control", "no-store");
    return new Response(null, { status: 202, headers });
  } catch {
    if (acquired) {
      try {
        await ctx.runMutation(failProcessing, { intentId });
      } catch {
        // The expiry sweep is the final bounded cleanup path.
      }
    }
    return new Response("Invalid upload", { status: 400, headers });
  }
});

export const download = httpAction(async (ctx, request) => {
  const headers = responseHeaders(request);
  if (!headers) return new Response("Forbidden", { status: 403 });
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return new Response("Unauthorized", { status: 401, headers });
  const parts = pathParts(request);
  const pageId = parts.at(-1) as Id<"privateFilePages"> | undefined;
  const fileId = parts.at(-2) as Id<"files"> | undefined;
  if (!fileId || !pageId)
    return new Response("Not found", { status: 404, headers });
  try {
    const access = await ctx.runMutation(authorizeDownload, { fileId, pageId });
    const blob = await ctx.storage.get(access.storageId);
    if (!blob) return new Response("Not found", { status: 404, headers });
    headers.set("Content-Type", "image/webp");
    headers.set("Content-Disposition", `inline; filename="${access.filename}"`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(blob, { status: 200, headers });
  } catch {
    return new Response("Not found", { status: 404, headers });
  }
});
