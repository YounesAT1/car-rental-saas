import { v } from "convex/values";
import { query } from "./_generated/server";

// A minimal provider smoke check; no identity details or application data are returned.
export const check = query({
  args: {},
  returns: v.object({ status: v.literal("ready"), authenticated: v.boolean() }),
  handler: async (ctx) => ({
    status: "ready" as const,
    authenticated: (await ctx.auth.getUserIdentity()) !== null,
  }),
});
