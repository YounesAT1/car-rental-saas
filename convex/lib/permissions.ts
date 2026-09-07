export const permissionIds = [
  "vehicle.read",
  "vehicle.create",
  "vehicle.update",
  "vehicle.archive",
  "vehicle.cost.read",
  "vehicle.publish",
  "reservation.read",
  "reservation.create",
  "reservation.update",
  "reservation.cancel",
  "reservation.overridePolicy",
  "rental.read",
  "rental.checkout",
  "rental.update",
  "rental.return",
  "customer.read",
  "customer.create",
  "customer.update",
  "customer.sensitive.read",
  "customer.document.verify",
  "maintenance.read",
  "maintenance.manage",
  "inspection.read",
  "inspection.manage",
  "damage.read",
  "damage.manage",
  "availability.manage",
  "document.vehicle.read",
  "document.vehicle.manage",
  "odometer.correct",
  "finance.read",
  "finance.manage",
  "payment.collect",
  "payment.refund",
  "deposit.manage",
  "invoice.issue",
  "invoice.credit",
  "pricing.read",
  "pricing.manage",
  "employee.read",
  "employee.manage",
  "agency.settings",
  "branch.manage",
  "agency.ownership.transfer",
  "billing.manage",
  "analytics.operations.read",
  "analytics.finance.read",
  "audit.read",
  "export.operations",
  "export.sensitive",
  "task.read",
  "task.manage",
  "message.read",
  "message.send",
  "ai.use",
  "knowledge.manage",
] as const;

export type PermissionId = (typeof permissionIds)[number];

export const roleKeys = [
  "AGENCY_OWNER",
  "AGENCY_ADMIN",
  "MANAGER",
  "RENTAL_AGENT",
  "FLEET_MANAGER",
  "MAINTENANCE_MANAGER",
  "ACCOUNTANT",
  "EMPLOYEE",
  "READ_ONLY",
] as const;

export type RoleKey = (typeof roleKeys)[number];

const operationalView = [
  "vehicle.read",
  "reservation.read",
  "rental.read",
  "maintenance.read",
  "inspection.read",
  "damage.read",
  "task.read",
  "employee.read",
  "analytics.operations.read",
  "pricing.read",
] as const satisfies readonly PermissionId[];

const deskWork = [
  ...operationalView,
  "customer.read",
  "customer.create",
  "customer.update",
  "reservation.create",
  "reservation.update",
  "reservation.cancel",
  "rental.checkout",
  "rental.update",
  "rental.return",
  "customer.sensitive.read",
  "customer.document.verify",
  "inspection.manage",
  "damage.manage",
  "payment.collect",
  "deposit.manage",
  "task.manage",
  "message.read",
  "message.send",
  "ai.use",
] as const satisfies readonly PermissionId[];

const fleetWork = [
  ...operationalView,
  "vehicle.create",
  "vehicle.update",
  "vehicle.archive",
  "document.vehicle.read",
  "document.vehicle.manage",
  "maintenance.manage",
  "inspection.manage",
  "damage.manage",
  "availability.manage",
  "task.manage",
  "ai.use",
] as const satisfies readonly PermissionId[];

const accounting = [
  "customer.read",
  "reservation.read",
  "rental.read",
  "vehicle.read",
  "vehicle.cost.read",
  "finance.read",
  "finance.manage",
  "payment.collect",
  "payment.refund",
  "deposit.manage",
  "invoice.issue",
  "invoice.credit",
  "analytics.finance.read",
  "export.sensitive",
  "ai.use",
] as const satisfies readonly PermissionId[];

const agencyPermissions = [...permissionIds];

export const rolePermissions: Record<RoleKey, readonly PermissionId[]> = {
  AGENCY_OWNER: agencyPermissions,
  AGENCY_ADMIN: agencyPermissions.filter(
    (permission) =>
      permission !== "agency.ownership.transfer" &&
      permission !== "billing.manage",
  ) as PermissionId[],
  MANAGER: [
    ...new Set([
      ...deskWork,
      ...fleetWork,
      "pricing.manage",
      "audit.read",
      "vehicle.publish",
    ]),
  ] as PermissionId[],
  RENTAL_AGENT: deskWork,
  FLEET_MANAGER: [
    ...new Set([...fleetWork, "odometer.correct"]),
  ] as PermissionId[],
  MAINTENANCE_MANAGER: [
    "vehicle.read",
    "maintenance.read",
    "maintenance.manage",
    "inspection.read",
    "inspection.manage",
    "damage.read",
    "damage.manage",
    "document.vehicle.read",
    "document.vehicle.manage",
    "availability.manage",
    "task.read",
    "task.manage",
    "ai.use",
  ],
  ACCOUNTANT: accounting,
  EMPLOYEE: ["vehicle.read", "task.read", "task.manage", "inspection.read"],
  READ_ONLY: operationalView,
};

export function hasPermission(
  role: RoleKey,
  permission: string,
): permission is PermissionId {
  return rolePermissions[role].includes(permission as PermissionId);
}

export function canGrantRole(actorRole: RoleKey, targetRole: RoleKey) {
  if (targetRole === "AGENCY_OWNER") return actorRole === "AGENCY_OWNER";
  const actorPermissions = new Set(rolePermissions[actorRole]);
  return rolePermissions[targetRole].every((permission) =>
    actorPermissions.has(permission),
  );
}
