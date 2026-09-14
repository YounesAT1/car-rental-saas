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
      const branches = await ctx.db
        .query("branches")
        .withIndex("by_agency_code", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const policies = await ctx.db
        .query("agencyPolicyVersions")
        .withIndex("by_agency_version", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const vehicles = await ctx.db
        .query("vehicles")
        .withIndex("by_agency_lifecycle", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const catalogs = await ctx.db
        .query("fleetCatalogs")
        .withIndex("by_agency_kind_code", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const images = await ctx.db
        .query("vehicleImages")
        .withIndex("by_agency_vehicle", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const files = await ctx.db
        .query("fleetFiles")
        .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const uploads = await ctx.db
        .query("fleetUploadIntents")
        .withIndex("by_agency_actor", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const usage = await ctx.db
        .query("fleetUsage")
        .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
        .take(2);
      const migrations = await ctx.db
        .query("operationsMigrations")
        .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
        .take(2);
      const guards = await ctx.db
        .query("vehicleAvailabilityStates")
        .withIndex("by_agency_readiness", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const issues = await ctx.db
        .query("vehicleReadinessIssues")
        .withIndex("by_agency_vehicle_active", (q) =>
          q.eq("agencyId", agencyId),
        )
        .take(100);
      const allocations = await ctx.db
        .query("vehicleAllocations")
        .withIndex("by_agency_source", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const mileage = await ctx.db
        .query("vehicleMileageLogs")
        .withIndex("by_agency_vehicle_observed", (q) =>
          q.eq("agencyId", agencyId),
        )
        .take(100);
      const tasks = await ctx.db
        .query("operationalTasks")
        .withIndex("by_agency_status_due", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const vendors = await ctx.db
        .query("maintenanceVendors")
        .withIndex("by_agency_active", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const schedules = await ctx.db
        .query("maintenanceSchedules")
        .withIndex("by_agency_active_due", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const maintenance = await ctx.db
        .query("maintenanceRecords")
        .withIndex("by_agency_status_time", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const expenses = await ctx.db
        .query("expenses")
        .withIndex("by_agency_date", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const templates = await ctx.db
        .query("inspectionTemplates")
        .withIndex("by_agency_active", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const inspections = await ctx.db
        .query("vehicleInspections")
        .withIndex("by_agency_status_time", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const damages = await ctx.db
        .query("damageReports")
        .withIndex("by_agency_status_time", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const documentTypes = await ctx.db
        .query("vehicleDocumentTypes")
        .withIndex("by_agency_code", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const documents = await ctx.db
        .query("vehicleDocuments")
        .withIndex("by_agency_status_expiry", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const privateFiles = await ctx.db
        .query("files")
        .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const privateIntents = await ctx.db
        .query("privateUploadIntents")
        .withIndex("by_agency_owner", (q) => q.eq("agencyId", agencyId))
        .take(100);
      const privateUsage = await ctx.db
        .query("privateFileUsage")
        .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
        .take(2);
      const privatePages = [];
      const privateBlobs = [];
      for (const intent of privateIntents) {
        const pages = await ctx.db
          .query("privateFilePages")
          .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
          .take(12);
        const blobs = await ctx.db
          .query("privateFileBlobs")
          .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
          .take(12);
        if (pages.length === 12 || blobs.length === 12)
          throw new Error("TEST_CLEANUP_LIMIT");
        privatePages.push(...pages);
        privateBlobs.push(...blobs);
      }
      const operationRows = [
        migrations,
        guards,
        issues,
        allocations,
        mileage,
        tasks,
        vendors,
        schedules,
        maintenance,
        expenses,
        templates,
        inspections,
        damages,
        documentTypes,
        documents,
        privateFiles,
        privateIntents,
      ];
      if (
        [
          invitations,
          audits,
          receipts,
          branches,
          policies,
          vehicles,
          catalogs,
          images,
          files,
          uploads,
          ...operationRows,
        ].some((rows) => rows.length === 100)
      )
        throw new Error("TEST_CLEANUP_LIMIT");
      for (const file of files) await ctx.storage.delete(file.storageId);
      const pageStorageIds = new Set(
        privatePages.map((page) => String(page.storageId)),
      );
      for (const page of privatePages) await ctx.storage.delete(page.storageId);
      for (const blob of privateBlobs)
        if (blob.storageId && !pageStorageIds.has(String(blob.storageId))) {
          const stored = await ctx.db.system.get(blob.storageId);
          if (stored) await ctx.storage.delete(blob.storageId);
        }
      for (const row of [
        ...members,
        ...invitations,
        ...audits,
        ...receipts,
        ...branches,
        ...policies,
        ...vehicles,
        ...catalogs,
        ...images,
        ...files,
        ...uploads,
        ...usage,
        ...privatePages,
        ...privateBlobs,
        ...privateFiles,
        ...privateIntents,
        ...privateUsage,
        ...documents,
        ...documentTypes,
        ...damages,
        ...inspections,
        ...templates,
        ...expenses,
        ...maintenance,
        ...schedules,
        ...vendors,
        ...tasks,
        ...mileage,
        ...allocations,
        ...issues,
        ...guards,
        ...migrations,
      ])
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
