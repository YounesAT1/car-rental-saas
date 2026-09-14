import { z } from "zod/v4";

// Supported launch markets. Explicit IANA identifiers avoid fixed-offset timezones.
export const timezones = [
  "Africa/Casablanca",
  "Africa/Algiers",
  "Africa/Tunis",
  "Africa/Cairo",
  "Europe/Paris",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Lisbon",
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/Zurich",
  "Asia/Dubai",
  "Asia/Riyadh",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "UTC",
] as const;
export const currencies = [
  "MAD",
  "EUR",
  "GBP",
  "USD",
  "CAD",
  "AED",
  "SAR",
  "DZD",
  "TND",
  "EGP",
  "CHF",
] as const;
export const countries = [
  "MA",
  "DZ",
  "TN",
  "EG",
  "FR",
  "GB",
  "ES",
  "DE",
  "IT",
  "PT",
  "BE",
  "NL",
  "CH",
  "AE",
  "SA",
  "US",
  "CA",
] as const;
export const settingsLocales = ["en", "fr", "ar"] as const;
export const fuelPolicies = ["full_to_full", "same_to_same"] as const;

const fallbackValidation = {
  name: "Use 2–160 characters.",
  code: "Use 2–20 letters, numbers or hyphens.",
  text: "This value is too long.",
  email: "Enter a valid email address.",
  phone: "Enter a valid phone number.",
  website: "Enter an HTTPS website address.",
  choice: "Choose a supported value.",
  required: "This field is required.",
  hours: "Use HH:mm with opening before closing. Intervals must not overlap.",
  date: "Use a valid, unique date (YYYY-MM-DD).",
  limit: "Too many entries.",
  number: "Enter a whole number within the indicated range.",
  amount: "Enter a valid amount within the indicated range.",
  terms: "Add policy text in at least one language.",
};
export type SettingsValidation = typeof fallbackValidation;

export function settingsSchemas(m: SettingsValidation = fallbackValidation) {
  const text = (max: number) => z.string().trim().max(max, m.text);
  const name = text(160).min(2, m.name);
  const choice = { error: m.choice };
  const phone = text(32).refine(
    (s) => !s || /^[+\d][\d ()+.-]{5,31}$/.test(s),
    m.phone,
  );
  const email = text(254).refine(
    (s) => !s || z.email().safeParse(s).success,
    m.email,
  );
  const integer = (min: number, max: number) =>
    z
      .number({ error: m.number })
      .int(m.number)
      .min(min, m.number)
      .max(max, m.number);
  const address = {
    address: text(240),
    city: text(100),
    postalCode: text(20),
    country: z.enum(countries, choice),
  };
  const business = z.object({
    name,
    legalName: text(160),
    contactEmail: email,
    phone,
    website: text(240).refine((s) => {
      if (!s) return true;
      try {
        const url = new URL(s);
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    }, m.website),
    ...address,
    timezone: z.enum(timezones, choice),
    currency: z.enum(currencies, choice),
    defaultLocale: z.enum(settingsLocales, choice),
  });
  const interval = z
    .object({
      opens: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, m.hours),
      closes: z
        .string()
        .regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, m.hours),
    })
    .refine((s) => s.opens < s.closes, { message: m.hours, path: ["closes"] });
  const hours = z
    .array(
      z.object({
        day: integer(0, 6),
        intervals: z
          .array(interval)
          .max(2, m.limit)
          .superRefine((slots, ctx) => {
            const first = slots[0];
            const second = slots[1];
            if (first && second && second.opens < first.closes)
              ctx.addIssue({
                code: "custom",
                message: m.hours,
                path: [1, "opens"],
              });
          }),
      }),
    )
    .length(7, m.hours)
    .refine((days) => new Set(days.map((d) => d.day)).size === 7, m.hours);
  const closures = z
    .array(
      z.object({
        date: z.string().refine(isCalendarDate, m.date),
        reason: text(160),
      }),
    )
    .max(32, m.limit)
    .refine(
      (days) => new Set(days.map((d) => d.date)).size === days.length,
      m.date,
    );
  const branch = z.object({
    name,
    code: text(20)
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, m.code),
    ...address,
    address: text(240).min(1, m.required),
    city: text(100).min(1, m.required),
    timezone: z.enum(timezones, choice),
    phone,
    contactEmail: email,
    hours,
    closures,
  });
  const policy = z.object({
    minimumDriverAge: integer(18, 99),
    minimumLicenseYears: integer(0, 30),
    maximumRentalDays: integer(1, 365),
    preparationMinutes: integer(0, 1440),
    graceMinutes: integer(0, 1440),
    bookingHorizonDays: integer(1, 730),
    includedKmPerDay: integer(0, 10000),
    fuelPolicy: z.enum(fuelPolicies, choice),
    depositAmountMinor: integer(0, 100_000_000),
    freeCancellationHours: integer(0, 8760),
    terms: z
      .object({ en: text(8000), fr: text(8000), ar: text(8000) })
      .refine((terms) => Object.values(terms).some(Boolean), {
        message: m.terms,
        path: ["en"],
      }),
  });
  return { business, branch, policy };
}

export type BusinessValues = z.infer<
  ReturnType<typeof settingsSchemas>["business"]
>;
export type BranchValues = z.infer<
  ReturnType<typeof settingsSchemas>["branch"]
>;
export type PolicyValues = z.infer<
  ReturnType<typeof settingsSchemas>["policy"]
>;

export function defaultHours(): BranchValues["hours"] {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    intervals:
      day >= 1 && day <= 5 ? [{ opens: "09:00", closes: "18:00" }] : [],
  }));
}
export const draftPolicy: PolicyValues = {
  minimumDriverAge: 21,
  minimumLicenseYears: 1,
  maximumRentalDays: 90,
  preparationMinutes: 30,
  graceMinutes: 30,
  bookingHorizonDays: 365,
  includedKmPerDay: 0,
  fuelPolicy: "full_to_full",
  depositAmountMinor: 0,
  freeCancellationHours: 48,
  terms: { en: "", fr: "", ar: "" },
};

export function currencyDecimals(currency: string) {
  return currency === "TND" ? 3 : 2;
}
export function minorToDecimal(amount: number, currency: string) {
  return (amount / 10 ** currencyDecimals(currency)).toFixed(
    currencyDecimals(currency),
  );
}
export function decimalToMinor(value: string, currency: string) {
  const digits = currencyDecimals(currency);
  if (!new RegExp(`^\\d{1,9}(?:[.,]\\d{1,${digits}})?$`).test(value.trim()))
    return NaN;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
}
export function policyFormSchema(m: SettingsValidation, currency: string) {
  return settingsSchemas(m)
    .policy.omit({ depositAmountMinor: true })
    .extend({
      depositAmount: z.string().refine((value) => {
        const minor = decimalToMinor(value, currency);
        return (
          Number.isSafeInteger(minor) && minor >= 0 && minor <= 100_000_000
        );
      }, m.amount),
    });
}
export type PolicyFormValues = z.infer<ReturnType<typeof policyFormSchema>>;

export function isCalendarDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "2000-01-01" ||
    value > "2100-12-31"
  )
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

// A known instant maps unambiguously to local hours, including DST transitions.
// Future booking phases must separately resolve user-entered ambiguous local times.
export function isBranchOpenAt(
  branch: Pick<BranchValues, "timezone" | "hours" | "closures">,
  instant: number,
) {
  if (!Number.isFinite(instant)) return false;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: branch.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (name: string) =>
    parts.find((p) => p.type === name)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  if (branch.closures.some((c) => c.date === date)) return false;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const time = `${part("hour")}:${part("minute")}`;
  return (
    branch.hours
      .find((h) => h.day === day)
      ?.intervals.some((s) => s.opens <= time && time < s.closes) ?? false
  );
}
