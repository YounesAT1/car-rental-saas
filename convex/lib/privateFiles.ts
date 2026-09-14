import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  PRIVATE_OUTPUT_LIMIT,
  PRIVATE_STORAGE_LIMIT,
} from "../../src/lib/operations";
import { fleetAccess } from "./fleet";
import { fail } from "./operations";
import { fileOwner } from "./operationsValidators";
import { hasPermission, type PermissionId } from "./permissions";

export type FileOwner = Infer<typeof fileOwner>;
type ReadCtx = QueryCtx | MutationCtx;

export function privateOwnerKey(owner: FileOwner) {
  return `${owner.kind}:${owner.id}`;
}

function ownerPermission(owner: FileOwner, write: boolean): PermissionId {
  switch (owner.kind) {
    case "document":
      return write ? "document.vehicle.manage" : "document.vehicle.read";
    case "maintenance":
      return write ? "maintenance.manage" : "maintenance.read";
    case "inspection":
      return write ? "inspection.manage" : "inspection.read";
    case "damage":
      return write ? "damage.manage" : "damage.read";
  }
}

export async function loadPrivateOwner(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  owner: FileOwner,
) {
  switch (owner.kind) {
    case "document": {
      const record = await ctx.db.get(owner.id);
      if (
        !record ||
        record.agencyId !== agencyId ||
        record.vehicleId !== vehicleId
      )
        fail("PRIVATE_FILE_OWNER");
      return record;
    }
    case "maintenance": {
      const record = await ctx.db.get(owner.id);
      if (
        !record ||
        record.agencyId !== agencyId ||
        record.vehicleId !== vehicleId
      )
        fail("PRIVATE_FILE_OWNER");
      return record;
    }
    case "inspection": {
      const record = await ctx.db.get(owner.id);
      if (
        !record ||
        record.agencyId !== agencyId ||
        record.vehicleId !== vehicleId
      )
        fail("PRIVATE_FILE_OWNER");
      return record;
    }
    case "damage": {
      const record = await ctx.db.get(owner.id);
      if (
        !record ||
        record.agencyId !== agencyId ||
        record.vehicleId !== vehicleId
      )
        fail("PRIVATE_FILE_OWNER");
      return record;
    }
  }
}

function ownerAcceptsUpload(owner: FileOwner, record: { status: string }) {
  switch (owner.kind) {
    case "document":
      return record.status === "draft";
    case "maintenance":
      return record.status === "planned" || record.status === "in_progress";
    case "inspection":
      return record.status === "draft";
    case "damage":
      return record.status !== "resolved";
  }
}

export async function authorizePrivateOwner(
  ctx: ReadCtx,
  agencyId: Id<"agencies">,
  vehicleId: Id<"vehicles">,
  owner: FileOwner,
  write: boolean,
) {
  const access = await fleetAccess(
    ctx,
    agencyId,
    ownerPermission(owner, write),
  );
  const record = await loadPrivateOwner(ctx, agencyId, vehicleId, owner);
  if (write && !ownerAcceptsUpload(owner, record)) fail("PRIVATE_FILE_LOCKED");
  return { ...access, record };
}

export async function authorizeStoredActor(
  ctx: ReadCtx,
  intent: Doc<"privateUploadIntents">,
) {
  const user = await ctx.db.get(intent.actorId);
  const membership = await ctx.db
    .query("agencyMembers")
    .withIndex("by_agency_user", (q) =>
      q.eq("agencyId", intent.agencyId).eq("userId", intent.actorId),
    )
    .unique();
  if (
    user?.status !== "active" ||
    membership?.status !== "active" ||
    !hasPermission(membership.roleKey, ownerPermission(intent.owner, true))
  )
    fail("PERMISSION_DENIED");
  const record = await loadPrivateOwner(
    ctx,
    intent.agencyId,
    intent.vehicleId,
    intent.owner,
  );
  if (!ownerAcceptsUpload(intent.owner, record)) fail("PRIVATE_FILE_LOCKED");
  return { user, membership, record };
}

export async function privateUsage(ctx: MutationCtx, agencyId: Id<"agencies">) {
  const current = await ctx.db
    .query("privateFileUsage")
    .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
    .unique();
  if (current) return current;
  const id = await ctx.db.insert("privateFileUsage", {
    agencyId,
    bytes: 0,
    reservedBytes: 0,
  });
  return (await ctx.db.get(id))!;
}

export function assertPrivateQuota(
  usage: Doc<"privateFileUsage">,
  reservation = PRIVATE_OUTPUT_LIMIT,
) {
  if (usage.bytes + usage.reservedBytes + reservation > PRIVATE_STORAGE_LIMIT)
    fail("PRIVATE_FILE_QUOTA");
}
