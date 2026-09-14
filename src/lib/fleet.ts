import { z } from "zod";

export const transmissions = ["manual", "automatic"] as const;
export const fuels = ["petrol", "diesel", "hybrid", "electric"] as const;
export const normalizeIdentifier = (value: string) =>
  value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-._]/gu, "");
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_STORED_PHOTO_BYTES = 1024 * 1024;
export const MAX_PHOTOS = 12;
export const STORAGE_LIMIT = 250 * 1024 * 1024;
export const labelsSchema = z
  .object({
    en: z.string().trim().max(160),
    fr: z.string().trim().max(160),
    ar: z.string().trim().max(160),
  })
  .refine((v) => Boolean(v.en || v.fr || v.ar));
export type FleetLabels = z.infer<typeof labelsSchema>;
export function localizedLabel(labels: FleetLabels, locale: string) {
  return (
    labels[locale as keyof FleetLabels] || labels.en || labels.fr || labels.ar
  );
}
export function fleetSchema(invalid = "Invalid value") {
  const text = (max: number) => z.string().trim().max(max, invalid);
  const required = (max: number) => text(max).min(1, invalid);
  return z.object({
    fleetNumber: required(32).refine(
      (s) => /^[A-Z0-9-]+$/i.test(s) && normalizeIdentifier(s).length > 0,
      invalid,
    ),
    plate: required(32).refine(
      (s) => normalizeIdentifier(s).length > 0,
      invalid,
    ),
    vin: text(17).refine(
      (s) => !s || /^[A-HJ-NPR-Z0-9]{17}$/i.test(s),
      invalid,
    ),
    make: required(80),
    model: required(80),
    trim: text(80),
    year: z
      .number({ error: invalid })
      .int(invalid)
      .min(1950, invalid)
      .max(new Date().getUTCFullYear() + 1, invalid),
    color: text(60),
    transmission: z.enum(transmissions, { error: invalid }),
    fuel: z.enum(fuels, { error: invalid }),
    seats: z
      .number({ error: invalid })
      .int(invalid)
      .min(1, invalid)
      .max(20, invalid),
    doors: z
      .number({ error: invalid })
      .int(invalid)
      .min(2, invalid)
      .max(6, invalid),
    branchId: required(64),
    categoryId: required(64),
    featureIds: z
      .array(z.string().min(1))
      .max(30, invalid)
      .refine((s) => new Set(s).size === s.length, invalid),
    description: text(3000),
    notes: text(3000),
  });
}
export type VehicleValues = z.infer<ReturnType<typeof fleetSchema>>;
export const catalogSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(24)
    .regex(/^[A-Z0-9-]+$/),
  labels: labelsSchema,
  publicVisible: z.boolean(),
});
