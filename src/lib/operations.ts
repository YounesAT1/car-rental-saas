import { Temporal } from "@js-temporal/polyfill";

export const MAX_METERS = 10_000_000_000;
export const MAX_ALLOCATION_CANDIDATES = 512;
export const MAX_ISSUES = 128;
export const MAX_SCHEDULES = 50;
export const MAX_DOCUMENT_TYPES = 32;
export const PRIVATE_SOURCE_LIMIT = 3 * 1024 * 1024;
export const PRIVATE_OUTPUT_LIMIT = 8 * 1024 * 1024;
export const PRIVATE_STORAGE_LIMIT = 250 * 1024 * 1024;
export const PRIVATE_PAGE_LIMIT = 10;

export function distanceMeters(value: number, unit: "km" | "mi") {
  const result = Math.round(value * (unit === "km" ? 1000 : 1609.344));
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(result) ||
    result > MAX_METERS
  )
    throw new Error("OPERATIONS_INVALID");
  return result;
}

export function integer(value: number, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error("OPERATIONS_INVALID");
  return value;
}
export function textValue(value: string, max = 2000, required = false) {
  const clean = value.trim();
  if (clean.length > max || (required && !clean))
    throw new Error("OPERATIONS_INVALID");
  return clean;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("OPERATIONS_INVALID");
  return Temporal.PlainDate.from(value).toString();
}
export function localInstant(local: string, timezone: string, offset?: string) {
  const plain = Temporal.PlainDateTime.from(local);
  const earlier = plain.toZonedDateTime(timezone, {
    disambiguation: "earlier",
  });
  const later = plain.toZonedDateTime(timezone, { disambiguation: "later" });
  if (
    !earlier.toPlainDateTime().equals(plain) ||
    !later.toPlainDateTime().equals(plain)
  )
    throw new Error("TIME_NONEXISTENT");
  if (earlier.epochMilliseconds !== later.epochMilliseconds) {
    if (offset === earlier.offset) return earlier.epochMilliseconds;
    if (offset === later.offset) return later.epochMilliseconds;
    throw new Error("TIME_AMBIGUOUS");
  }
  return earlier.epochMilliseconds;
}
export function localOffsets(local: string, timezone: string) {
  try {
    const plain = Temporal.PlainDateTime.from(local);
    return [
      ...new Set(
        (["earlier", "later"] as const).map(
          (disambiguation) =>
            plain.toZonedDateTime(timezone, { disambiguation }).offset,
        ),
      ),
    ];
  } catch {
    return [];
  }
}
export function localDateTimeValue(instant: number, timezone: string) {
  return Temporal.Instant.fromEpochMilliseconds(instant)
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
export function expiryInstant(date: string, timezone: string) {
  return Temporal.PlainDate.from(validDate(date))
    .add({ days: 1 })
    .toZonedDateTime(timezone).epochMilliseconds;
}
export function addDays(instant: number, days: number, timezone: string) {
  return Temporal.Instant.fromEpochMilliseconds(instant)
    .toZonedDateTimeISO(timezone)
    .add({ days }).epochMilliseconds;
}
export function overlaps(
  a: { startAt: number; endAt: number },
  b: { startAt: number; endAt: number },
) {
  return a.startAt < b.endAt && a.endAt > b.startAt;
}
export function dueState(
  schedule: {
    days?: number;
    meters?: number;
    nextDueAt?: number;
    nextDueMeters?: number;
    baselineValid?: boolean;
  },
  mileage: number | undefined,
  now: number,
): "due" | "unknown" | "upcoming" {
  if (schedule.baselineValid === false) return "unknown";
  if (
    (schedule.nextDueAt !== undefined && now >= schedule.nextDueAt) ||
    (schedule.nextDueMeters !== undefined &&
      mileage !== undefined &&
      mileage >= schedule.nextDueMeters)
  )
    return "due";
  if (
    (schedule.days !== undefined && schedule.nextDueAt === undefined) ||
    (schedule.meters !== undefined &&
      (schedule.nextDueMeters === undefined || mileage === undefined))
  )
    return "unknown";
  return "upcoming";
}

export type MaintenanceStatus =
  "planned" | "in_progress" | "completed" | "cancelled";

export function maintenanceTransitionAllowed(
  current: MaintenanceStatus,
  next: MaintenanceStatus,
) {
  return (
    (current === "planned" &&
      (next === "in_progress" || next === "cancelled")) ||
    (current === "in_progress" &&
      (next === "completed" || next === "cancelled"))
  );
}

export type DamageStatus =
  "reported" | "reviewing" | "approved" | "repairing" | "resolved";

export function damageTransitionAllowed(
  current: DamageStatus,
  next: DamageStatus,
) {
  const order: DamageStatus[] = [
    "reported",
    "reviewing",
    "approved",
    "repairing",
    "resolved",
  ];
  return order.indexOf(next) === order.indexOf(current) + 1;
}

export function costTotal(
  lines: ReadonlyArray<{ amountMinor: number }>,
  limit = 1_000_000_000_000,
) {
  let total = 0;
  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.amountMinor) ||
      line.amountMinor < 0 ||
      line.amountMinor > limit
    )
      throw new Error("OPERATIONS_INVALID");
    total += line.amountMinor;
    if (!Number.isSafeInteger(total) || total > limit)
      throw new Error("OPERATIONS_INVALID");
  }
  return total;
}

export function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${fingerprint(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
