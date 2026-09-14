import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { mutation, query } from "./_generated/server";
import { fleetAccess, ownedVehicle } from "./lib/fleet";
import { command, fail } from "./lib/operations";
import { mileageDoc, unit } from "./lib/operationsValidators";
import { writeMileage } from "./lib/mileage";
import type { Id } from "./_generated/dataModel";
export const list = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(mileageDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId);
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    return ctx.db
      .query("vehicleMileageLogs")
      .withIndex("by_agency_vehicle_observed", (q) =>
        q.eq("agencyId", args.agencyId).eq("vehicleId", args.vehicleId),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
  },
});
export const save = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    value: v.number(),
    unit,
    observedAt: v.number(),
    reason: v.string(),
    supersedesId: v.optional(v.id("vehicleMileageLogs")),
    expectedRevision: v.number(),
    replacement: v.boolean(),
    priorLifetimeMeters: v.optional(v.number()),
    requestKey: v.string(),
  },
  returns: v.id("vehicleMileageLogs"),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      args.supersedesId || args.replacement
        ? "odometer.correct"
        : "vehicle.update",
    );
    const vehicle = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    if (vehicle.lifecycle !== "active" && !args.supersedesId)
      fail("FLEET_ARCHIVED");
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "mileage.save",
      args.requestKey,
      args,
      () =>
        writeMileage(ctx, args.agencyId, args.vehicleId, user._id, args, {
          kind: "manual",
          key: args.requestKey,
        }),
    )) as Id<"vehicleMileageLogs">;
  },
});
