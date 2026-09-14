import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fleetAccess, ownedVehicle } from "./lib/fleet";
import { writeMileage } from "./lib/mileage";
import {
  cleanCostLines,
  completeSchedules,
  postExpense,
  requireMaintenance,
  requireSchedules,
  requireVendor,
} from "./lib/maintenance";
import {
  allocate,
  base,
  canReadWorkCost,
  command,
  fail,
  operationAudit,
  refreshReadiness,
  refreshSchedules,
  releaseAllocation,
  requireGuard,
  revision,
  setIssue,
  shortReason,
} from "./lib/operations";
import {
  costLine,
  documentValidator,
  expenseDoc,
  maintenanceFields,
  maintenanceStatus,
  scheduleDoc,
  unit,
} from "./lib/operationsValidators";
import {
  addDays,
  costTotal,
  integer,
  maintenanceTransitionAllowed,
  MAX_METERS,
  MAX_SCHEDULES,
  textValue,
} from "../src/lib/operations";

const maintenanceView = documentValidator("maintenanceRecords", {
  ...maintenanceFields,
  costLines: v.union(v.array(costLine), v.null()),
});

function projectMaintenance(
  record: Doc<"maintenanceRecords">,
  canReadCost: boolean,
) {
  return {
    ...record,
    costLines: canReadCost ? record.costLines : null,
  };
}

export const schedules = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    active: v.boolean(),
  },
  returns: v.array(scheduleDoc),
  handler: async (ctx, args) => {
    await fleetAccess(ctx, args.agencyId, "maintenance.read");
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    const rows = await ctx.db
      .query("maintenanceSchedules")
      .withIndex("by_agency_vehicle_active", (q) =>
        q
          .eq("agencyId", args.agencyId)
          .eq("vehicleId", args.vehicleId)
          .eq("active", args.active),
      )
      .take(MAX_SCHEDULES + 1);
    if (rows.length > MAX_SCHEDULES) fail("OPERATIONS_LIMIT");
    return rows;
  },
});

export const saveSchedule = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    id: v.optional(v.id("maintenanceSchedules")),
    expectedRevision: v.number(),
    service: v.string(),
    days: v.optional(v.number()),
    meters: v.optional(v.number()),
    active: v.boolean(),
    requestKey: v.string(),
  },
  returns: v.id("maintenanceSchedules"),
  handler: async (ctx, args) => {
    const { user, agency } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.manage",
    );
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    const current = args.id ? await ctx.db.get(args.id) : null;
    if (
      args.id &&
      (!current ||
        current.agencyId !== args.agencyId ||
        current.vehicleId !== args.vehicleId)
    )
      fail("MAINTENANCE_SCHEDULE_NOT_FOUND");
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "maintenance.schedule.save",
      args.requestKey,
      args,
      async () => {
        if (current) revision(current, args.expectedRevision);
        const service = textValue(args.service, 120, true);
        const days =
          args.days === undefined ? undefined : integer(args.days, 1, 3650);
        const meters =
          args.meters === undefined
            ? undefined
            : integer(args.meters, 1, MAX_METERS);
        if (days === undefined && meters === undefined) fail();
        const activeRows = await ctx.db
          .query("maintenanceSchedules")
          .withIndex("by_agency_vehicle_active", (q) =>
            q
              .eq("agencyId", args.agencyId)
              .eq("vehicleId", args.vehicleId)
              .eq("active", true),
          )
          .take(MAX_SCHEDULES + 1);
        if (
          args.active &&
          !current?.active &&
          activeRows.length >= MAX_SCHEDULES
        )
          fail("OPERATIONS_LIMIT");
        const timezone = current?.timezone ?? agency.timezone;
        const baselineAt = current?.baselineAt;
        const baselineMeters = current?.baselineMeters;
        const baselineValid =
          (days === undefined || baselineAt !== undefined) &&
          (meters === undefined ||
            (baselineMeters !== undefined && current?.mileageId !== undefined));
        const nextDueAt =
          days === undefined || baselineAt === undefined
            ? undefined
            : addDays(baselineAt, days, timezone);
        const nextDueMeters =
          meters === undefined || baselineMeters === undefined
            ? undefined
            : baselineMeters + meters;
        if (nextDueMeters !== undefined && nextDueMeters > MAX_METERS)
          fail("MILEAGE_INVALID");
        const values = {
          service,
          days,
          meters,
          baselineAt,
          baselineMeters,
          mileageId: current?.mileageId,
          baselineValid,
          nextDueAt,
          nextDueMeters,
          timezone,
          active: args.active,
          lastRecordId: current?.lastRecordId,
        };
        let id = current?._id;
        if (current)
          await ctx.db.patch(current._id, {
            ...values,
            revision: current.revision + 1,
          });
        else
          id = await ctx.db.insert("maintenanceSchedules", {
            ...base(args.agencyId, user._id),
            vehicleId: args.vehicleId,
            ...values,
          });
        await refreshSchedules(ctx, args.agencyId, args.vehicleId, user._id);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "schedule.saved",
          id!,
        );
        return id!;
      },
    )) as Id<"maintenanceSchedules">;
  },
});

export const list = query({
  args: {
    agencyId: v.id("agencies"),
    status: maintenanceStatus,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(maintenanceView),
  handler: async (ctx, args) => {
    const { membership } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.read",
    );
    const page = await ctx.db
      .query("maintenanceRecords")
      .withIndex("by_agency_status_time", (q) =>
        q.eq("agencyId", args.agencyId).eq("status", args.status),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
    const canReadCost = canReadWorkCost(membership.roleKey);
    return {
      ...page,
      page: page.page.map((record) => projectMaintenance(record, canReadCost)),
    };
  },
});

export const history = query({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(maintenanceView),
  handler: async (ctx, args) => {
    const { membership } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.read",
    );
    await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    const page = await ctx.db
      .query("maintenanceRecords")
      .withIndex("by_agency_vehicle_time", (q) =>
        q.eq("agencyId", args.agencyId).eq("vehicleId", args.vehicleId),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
    const canReadCost = canReadWorkCost(membership.roleKey);
    return {
      ...page,
      page: page.page.map((record) => projectMaintenance(record, canReadCost)),
    };
  },
});

export const get = query({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("maintenanceRecords"),
  },
  returns: v.union(
    v.null(),
    v.object({
      record: maintenanceView,
      expenses: v.union(v.array(expenseDoc), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { membership } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.read",
    );
    const record = await ctx.db.get(args.id);
    if (!record || record.agencyId !== args.agencyId) return null;
    const canReadCost = canReadWorkCost(membership.roleKey);
    const expenses = canReadCost
      ? await ctx.db
          .query("expenses")
          .withIndex("by_agency_maintenance", (q) =>
            q.eq("agencyId", args.agencyId).eq("maintenanceId", record._id),
          )
          .take(101)
      : null;
    if (expenses && expenses.length > 100) fail("OPERATIONS_LIMIT");
    return {
      record: projectMaintenance(record, canReadCost),
      expenses,
    };
  },
});

export const save = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.optional(v.id("maintenanceRecords")),
    expectedRevision: v.number(),
    vehicleId: v.id("vehicles"),
    vendorId: v.optional(v.id("maintenanceVendors")),
    title: v.string(),
    findings: v.string(),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    scheduleIds: v.array(v.id("maintenanceSchedules")),
    costLines: v.array(costLine),
    expectedCurrency: v.string(),
    requestKey: v.string(),
  },
  returns: v.id("maintenanceRecords"),
  handler: async (ctx, args) => {
    const { user, agency } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.manage",
    );
    const vehicle = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    if (vehicle.lifecycle !== "active") fail("FLEET_ARCHIVED");
    const current = args.id
      ? await requireMaintenance(ctx, args.agencyId, args.id)
      : null;
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "maintenance.save",
      args.requestKey,
      args,
      async () => {
        if (current) {
          revision(current, args.expectedRevision);
          if (current.status !== "planned") fail("MAINTENANCE_LOCKED");
          if (current.vehicleId !== args.vehicleId) fail();
        }
        if (args.expectedCurrency !== agency.currency)
          fail("OPERATIONS_CONFLICT");
        await requireVendor(ctx, args.agencyId, args.vendorId);
        await requireSchedules(
          ctx,
          args.agencyId,
          args.vehicleId,
          args.scheduleIds,
        );
        if ((args.startAt === undefined) !== (args.endAt === undefined)) fail();
        const title = textValue(args.title, 160, true);
        const findings = textValue(args.findings, 4000);
        const costLines = cleanCostLines(args.costLines);
        const values = {
          vehicleId: args.vehicleId,
          vendorId: args.vendorId,
          title,
          findings,
          status: "planned" as const,
          emergency: false,
          startAt: args.startAt,
          endAt: args.endAt,
          scheduleIds: args.scheduleIds,
          costLines,
          currency: agency.currency,
          readinessConfirmed: false,
          expenseRevision: current?.expenseRevision ?? 0,
        };
        let id = current?._id;
        if (current)
          await ctx.db.patch(current._id, {
            ...values,
            revision: current.revision + 1,
          });
        else
          id = await ctx.db.insert("maintenanceRecords", {
            ...base(args.agencyId, user._id),
            ...values,
          });
        const origin = { kind: "maintenance" as const, id: id! };
        if (args.startAt !== undefined && args.endAt !== undefined)
          await allocate(
            ctx,
            args.agencyId,
            args.vehicleId,
            user._id,
            origin,
            "maintenance",
            args.startAt,
            args.endAt,
            title,
          );
        else
          await releaseAllocation(ctx, args.agencyId, args.vehicleId, origin);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "maintenance.saved",
          id!,
        );
        return id!;
      },
    )) as Id<"maintenanceRecords">;
  },
});

export const start = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("maintenanceRecords"),
    expectedRevision: v.number(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.manage",
    );
    const record = await requireMaintenance(ctx, args.agencyId, args.id);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "maintenance.start",
      args.requestKey,
      args,
      async () => {
        revision(record, args.expectedRevision);
        if (!maintenanceTransitionAllowed(record.status, "in_progress"))
          fail("MAINTENANCE_TRANSITION");
        await requireGuard(ctx, args.agencyId, record.vehicleId);
        await ctx.db.patch(record._id, {
          status: "in_progress",
          actualStartAt: Date.now(),
          revision: record.revision + 1,
        });
        await setIssue(
          ctx,
          args.agencyId,
          record.vehicleId,
          user._id,
          { kind: "maintenance", id: record._id },
          record.title,
          true,
        );
        await refreshReadiness(ctx, args.agencyId, record.vehicleId, user._id);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "maintenance.started",
          record._id,
        );
        return record._id;
      },
    );
    return null;
  },
});

export const reportEmergency = mutation({
  args: {
    agencyId: v.id("agencies"),
    vehicleId: v.id("vehicles"),
    vendorId: v.optional(v.id("maintenanceVendors")),
    title: v.string(),
    findings: v.string(),
    scheduleIds: v.array(v.id("maintenanceSchedules")),
    expectedCurrency: v.string(),
    requestKey: v.string(),
  },
  returns: v.id("maintenanceRecords"),
  handler: async (ctx, args) => {
    const { user, agency } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.manage",
    );
    const vehicle = await ownedVehicle(ctx, args.agencyId, args.vehicleId);
    if (vehicle.lifecycle !== "active") fail("FLEET_ARCHIVED");
    return (await command(
      ctx,
      args.agencyId,
      user._id,
      "maintenance.emergency",
      args.requestKey,
      args,
      async () => {
        if (args.expectedCurrency !== agency.currency)
          fail("OPERATIONS_CONFLICT");
        await requireVendor(ctx, args.agencyId, args.vendorId);
        await requireSchedules(
          ctx,
          args.agencyId,
          args.vehicleId,
          args.scheduleIds,
        );
        await requireGuard(ctx, args.agencyId, args.vehicleId);
        const title = textValue(args.title, 160, true);
        const id = await ctx.db.insert("maintenanceRecords", {
          ...base(args.agencyId, user._id),
          vehicleId: args.vehicleId,
          vendorId: args.vendorId,
          title,
          findings: textValue(args.findings, 4000),
          status: "in_progress",
          emergency: true,
          actualStartAt: Date.now(),
          scheduleIds: args.scheduleIds,
          currency: agency.currency,
          costLines: [],
          readinessConfirmed: false,
          expenseRevision: 0,
        });
        await setIssue(
          ctx,
          args.agencyId,
          args.vehicleId,
          user._id,
          { kind: "maintenance", id },
          title,
          true,
        );
        await refreshReadiness(ctx, args.agencyId, args.vehicleId, user._id);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "maintenance.emergency_reported",
          id,
        );
        return id;
      },
    )) as Id<"maintenanceRecords">;
  },
});

export const complete = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("maintenanceRecords"),
    expectedRevision: v.number(),
    findings: v.string(),
    mileage: v.optional(
      v.object({
        value: v.number(),
        unit,
        observedAt: v.number(),
      }),
    ),
    costLines: v.array(costLine),
    expectedCurrency: v.string(),
    readinessConfirmed: v.boolean(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.manage",
    );
    const record = await requireMaintenance(ctx, args.agencyId, args.id);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "maintenance.complete",
      args.requestKey,
      args,
      async () => {
        revision(record, args.expectedRevision);
        if (!maintenanceTransitionAllowed(record.status, "completed"))
          fail("MAINTENANCE_TRANSITION");
        if (args.expectedCurrency !== record.currency)
          fail("OPERATIONS_CONFLICT");
        await requireGuard(ctx, args.agencyId, record.vehicleId);
        const completedAt = Date.now();
        let mileageId: Id<"vehicleMileageLogs"> | undefined;
        if (args.mileage) {
          mileageId = await writeMileage(
            ctx,
            args.agencyId,
            record.vehicleId,
            user._id,
            {
              ...args.mileage,
              reason: "Maintenance completion",
              expectedRevision: 0,
              replacement: false,
            },
            { kind: "maintenance", id: record._id },
          );
        }
        const costLines = cleanCostLines(args.costLines);
        const total = costTotal(costLines);
        const expenseRevision = total > 0 ? record.expenseRevision + 1 : 0;
        await ctx.db.patch(record._id, {
          status: "completed",
          findings: textValue(args.findings, 4000, true),
          completedAt,
          mileageId,
          costLines,
          readinessConfirmed: args.readinessConfirmed,
          expenseRevision,
          revision: record.revision + 1,
        });
        if (total > 0)
          await postExpense(
            ctx,
            args.agencyId,
            record.vehicleId,
            user._id,
            record._id,
            `maintenance:${record._id}:${expenseRevision}`,
            total,
            record.currency,
            record.title,
            completedAt,
          );
        await completeSchedules(
          ctx,
          args.agencyId,
          record.vehicleId,
          user._id,
          record._id,
          record.scheduleIds,
          completedAt,
        );
        await releaseAllocation(ctx, args.agencyId, record.vehicleId, {
          kind: "maintenance",
          id: record._id,
        });
        await setIssue(
          ctx,
          args.agencyId,
          record.vehicleId,
          user._id,
          { kind: "maintenance", id: record._id },
          args.readinessConfirmed
            ? record.title
            : "Post-maintenance readiness review required",
          !args.readinessConfirmed,
          "blocking",
          args.readinessConfirmed ? "Maintenance completed" : "",
        );
        await refreshReadiness(ctx, args.agencyId, record.vehicleId, user._id);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "maintenance.completed",
          record._id,
        );
        return record._id;
      },
    );
    return null;
  },
});

export const cancel = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("maintenanceRecords"),
    expectedRevision: v.number(),
    reason: v.string(),
    readinessConfirmed: v.boolean(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.manage",
    );
    const record = await requireMaintenance(ctx, args.agencyId, args.id);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "maintenance.cancel",
      args.requestKey,
      args,
      async () => {
        revision(record, args.expectedRevision);
        if (!maintenanceTransitionAllowed(record.status, "cancelled"))
          fail("MAINTENANCE_TRANSITION");
        const reason = shortReason(args.reason);
        await ctx.db.patch(record._id, {
          status: "cancelled",
          findings: reason,
          readinessConfirmed: args.readinessConfirmed,
          revision: record.revision + 1,
        });
        await releaseAllocation(ctx, args.agencyId, record.vehicleId, {
          kind: "maintenance",
          id: record._id,
        });
        await setIssue(
          ctx,
          args.agencyId,
          record.vehicleId,
          user._id,
          { kind: "maintenance", id: record._id },
          args.readinessConfirmed
            ? record.title
            : "Readiness review required after cancelled work",
          !args.readinessConfirmed,
          "blocking",
          args.readinessConfirmed ? reason : "",
        );
        await refreshReadiness(ctx, args.agencyId, record.vehicleId, user._id);
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "maintenance.cancelled",
          record._id,
        );
        return record._id;
      },
    );
    return null;
  },
});

export const correctCost = mutation({
  args: {
    agencyId: v.id("agencies"),
    id: v.id("maintenanceRecords"),
    expectedRevision: v.number(),
    replacementLines: v.array(costLine),
    expectedCurrency: v.string(),
    reason: v.string(),
    requestKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await fleetAccess(
      ctx,
      args.agencyId,
      "maintenance.manage",
    );
    const record = await requireMaintenance(ctx, args.agencyId, args.id);
    await command(
      ctx,
      args.agencyId,
      user._id,
      "maintenance.cost.correct",
      args.requestKey,
      args,
      async () => {
        revision(record, args.expectedRevision);
        if (record.status !== "completed") fail("MAINTENANCE_TRANSITION");
        if (args.expectedCurrency !== record.currency)
          fail("OPERATIONS_CONFLICT");
        const reason = shortReason(args.reason);
        const lines = cleanCostLines(args.replacementLines);
        const total = costTotal(lines);
        const expenses = await ctx.db
          .query("expenses")
          .withIndex("by_agency_maintenance", (q) =>
            q.eq("agencyId", args.agencyId).eq("maintenanceId", record._id),
          )
          .take(101);
        if (expenses.length > 100) fail("OPERATIONS_LIMIT");
        const reversed = new Set(
          expenses.flatMap((expense) =>
            expense.reversesId ? [expense.reversesId] : [],
          ),
        );
        const currentExpense = [...expenses]
          .reverse()
          .find(
            (expense) => expense.amountMinor > 0 && !reversed.has(expense._id),
          );
        if (!currentExpense && total === 0) fail();
        const nextExpenseRevision = record.expenseRevision + 1;
        const incurredAt = Date.now();
        if (currentExpense)
          await postExpense(
            ctx,
            args.agencyId,
            record.vehicleId,
            user._id,
            record._id,
            `maintenance:${record._id}:${nextExpenseRevision}:reversal`,
            -currentExpense.amountMinor,
            record.currency,
            reason,
            incurredAt,
            currentExpense._id,
          );
        if (total > 0)
          await postExpense(
            ctx,
            args.agencyId,
            record.vehicleId,
            user._id,
            record._id,
            `maintenance:${record._id}:${nextExpenseRevision}:replacement`,
            total,
            record.currency,
            reason,
            incurredAt,
          );
        await ctx.db.patch(record._id, {
          expenseRevision: nextExpenseRevision,
          revision: record.revision + 1,
        });
        await operationAudit(
          ctx,
          args.agencyId,
          user._id,
          "maintenance.cost_corrected",
          record._id,
        );
        return record._id;
      },
    );
    return null;
  },
});
