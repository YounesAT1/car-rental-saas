import { v } from "convex/values";

export const businessFields = {
  name: v.string(),
  legalName: v.string(),
  contactEmail: v.string(),
  phone: v.string(),
  website: v.string(),
  address: v.string(),
  city: v.string(),
  postalCode: v.string(),
  country: v.string(),
  timezone: v.string(),
  currency: v.string(),
  defaultLocale: v.union(v.literal("en"), v.literal("fr"), v.literal("ar")),
};
export const businessValidator = v.object(businessFields);
export const branchFields = {
  name: v.string(),
  code: v.string(),
  address: v.string(),
  city: v.string(),
  postalCode: v.string(),
  country: v.string(),
  timezone: v.string(),
  phone: v.string(),
  contactEmail: v.string(),
  hours: v.array(
    v.object({
      day: v.number(),
      intervals: v.array(v.object({ opens: v.string(), closes: v.string() })),
    }),
  ),
  closures: v.array(v.object({ date: v.string(), reason: v.string() })),
};
export const branchValidator = v.object(branchFields);
export const policyFields = {
  minimumDriverAge: v.number(),
  minimumLicenseYears: v.number(),
  maximumRentalDays: v.number(),
  preparationMinutes: v.number(),
  graceMinutes: v.number(),
  bookingHorizonDays: v.number(),
  includedKmPerDay: v.number(),
  fuelPolicy: v.union(v.literal("full_to_full"), v.literal("same_to_same")),
  depositAmountMinor: v.number(),
  freeCancellationHours: v.number(),
  terms: v.object({ en: v.string(), fr: v.string(), ar: v.string() }),
};
export const policyValidator = v.object(policyFields);
export const branchStatus = v.union(v.literal("active"), v.literal("archived"));
export const branchDto = v.object({
  ...branchFields,
  id: v.id("branches"),
  agencyId: v.id("agencies"),
  status: branchStatus,
  revision: v.number(),
  updatedAt: v.number(),
});
export const policyDto = v.object({
  ...policyFields,
  id: v.id("agencyPolicyVersions"),
  agencyId: v.id("agencies"),
  version: v.number(),
  currency: v.string(),
  effectiveAt: v.number(),
  actorUserId: v.id("users"),
});
