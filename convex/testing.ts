import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Administrator-only cleanup for the development smoke runner. No public reset API.
export const cleanupPhase2 = internalMutation({
  args: {
    runId: v.string(),
    issuer: v.string(),
    subjects: v.array(v.string()),
  },
  returns: v.object({ users: v.number(), agencies: v.number() }),
  handler: async (ctx, args) => {
    if (
      process.env.CONVEX_CLOUD_URL !== "https://wary-labrador-920.convex.cloud"
    )
      throw new Error("TEST_DEPLOYMENT_REQUIRED");
    if (!/^[a-f0-9-]{36}$/.test(args.runId) || args.subjects.length > 12)
      throw new Error("INVALID_TEST_RUN");
    const users = [];
    for (const subject of args.subjects) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_identity", (q) =>
          q.eq("issuer", args.issuer).eq("subject", subject),
        )
        .unique();
      if (!user) continue;
      if (
        !user.email?.startsWith(`phase2-${args.runId}-`) ||
        !user.email.endsWith("+clerk_test@example.com")
      )
        throw new Error("NOT_A_TEST_USER");
      users.push(user);
    }
    const userIds = new Set(users.map((user) => user._id));
    const agencyIds = new Set<
      import("./_generated/dataModel").Id<"agencies">
    >();
    for (const user of users) {
      const memberships = await ctx.db
        .query("agencyMembers")
        .withIndex("by_user_status", (q) => q.eq("userId", user._id))
        .take(100);
      if (memberships.length === 100) throw new Error("TEST_CLEANUP_LIMIT");
      for (const member of memberships) agencyIds.add(member.agencyId);
    }
    for (const agencyId of agencyIds) {
      const agency = await ctx.db.get(agencyId);
      if (
        !agency ||
        !userIds.has(agency.createdByUserId) ||
        !agency.slug.startsWith(`phase2-${args.runId}-`)
      )
        throw new Error("NOT_A_TEST_AGENCY");
      const members = await ctx.db
        .query("agencyMembers")
        .withIndex("by_agency_status", (q) => q.eq("agencyId", agencyId))
        .take(100);
      if (
        members.length === 100 ||
        members.some((member) => !userIds.has(member.userId))
      )
        throw new Error("NOT_A_TEST_MEMBERSHIP");
      const invitations = await ctx.db
        .query("agencyInvitations")
        .withIndex("by_agency_status_expiry", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const audits = await ctx.db
        .query("auditLogs")
        .withIndex("by_agency_time", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const receipts = await ctx.db
        .query("commandReceipts")
        .withIndex("by_command", (q) => q.eq("agencyId", agencyId))
        .take(100);
      if ([invitations, audits, receipts].some((rows) => rows.length === 100))
        throw new Error("TEST_CLEANUP_LIMIT");
      for (const row of [...members, ...invitations, ...audits, ...receipts])
        await ctx.db.delete(row._id);
      await ctx.db.delete(agencyId);
    }
    for (const user of users) {
      const preferences = await ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();
      if (preferences) await ctx.db.delete(preferences._id);
      await ctx.db.delete(user._id);
    }
    return { users: users.length, agencies: agencyIds.size };
  },
});
