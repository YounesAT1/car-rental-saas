"use client";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { CommonMessages } from "@/i18n/messages";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
export type VehicleRecord = NonNullable<
  FunctionReturnType<typeof api.fleet.get>
>;
export type CatalogRecord = FunctionReturnType<
  typeof api.fleetCatalogs.list
>[number];
export type BranchOption = FunctionReturnType<typeof api.fleet.options>[number];
export function fleetError(error: unknown, m: CommonMessages["fleet"]) {
  const text = String(error);
  if (text.includes("FLEET_CONFLICT")) return m.conflict;
  if (text.includes("FLEET_DUPLICATE")) return m.duplicate;
  if (text.includes("FLEET_REFERENCE")) return m.reference;
  if (text.includes("FLEET_ARCHIVED")) return m.archivedError;
  if (text.includes("UPLOAD_LIMIT")) return m.uploadLimit;
  if (text.includes("UPLOAD_INVALID")) return m.photoInvalid;
  if (text.includes("FLEET_LIMIT")) return m.limit;
  if (text.includes("INVALID_FLEET")) return m.invalid;
  return m.failed;
}
export function FleetFeedback({
  error,
  onReload,
}: {
  error: string | null;
  onReload?: () => void;
}) {
  const {
    messages: { fleet: m },
  } = useI18n();
  return error ? (
    <div className="fleet-feedback" role="alert">
      <p>{error}</p>
      {onReload && error === m.conflict && (
        <Button type="button" variant="outline" onClick={onReload}>
          {m.reload}
        </Button>
      )}
    </div>
  ) : null;
}
