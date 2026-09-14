import { v } from "convex/values";
export const labels = v.object({
  en: v.string(),
  fr: v.string(),
  ar: v.string(),
});
export const lifecycle = v.union(v.literal("active"), v.literal("archived"));
export const catalogKind = v.union(v.literal("category"), v.literal("feature"));
export const catalogFields = {
  code: v.string(),
  labels,
  publicVisible: v.boolean(),
};
export const vehicleFields = {
  fleetNumber: v.string(),
  plate: v.string(),
  vin: v.string(),
  make: v.string(),
  model: v.string(),
  trim: v.string(),
  year: v.number(),
  color: v.string(),
  transmission: v.union(v.literal("manual"), v.literal("automatic")),
  fuel: v.union(
    v.literal("petrol"),
    v.literal("diesel"),
    v.literal("hybrid"),
    v.literal("electric"),
  ),
  seats: v.number(),
  doors: v.number(),
  branchId: v.id("branches"),
  categoryId: v.id("fleetCatalogs"),
  featureIds: v.array(v.id("fleetCatalogs")),
  description: v.string(),
  notes: v.string(),
};
export const vehicleDto = v.object({
  mileageMeters: v.union(v.number(), v.null()),
  readiness: v.union(
    v.literal("needs_review"),
    v.literal("ready"),
    v.literal("blocked"),
  ),
  ...vehicleFields,
  id: v.id("vehicles"),
  lifecycle,
  publicVisible: v.boolean(),
  revision: v.number(),
  updatedAt: v.number(),
  branchName: v.string(),
  categoryLabels: labels,
  acquisitionCost: v.union(
    v.null(),
    v.object({ amountMinor: v.number(), currency: v.string() }),
  ),
});
export const catalogDto = v.object({
  ...catalogFields,
  id: v.id("fleetCatalogs"),
  kind: catalogKind,
  lifecycle,
  revision: v.number(),
});
