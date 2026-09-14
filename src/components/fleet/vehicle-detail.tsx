"use client";
import { useConfirm } from "@/components/confirmation-provider";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { decimalToMinor } from "@/lib/agency-settings";
import { localizedLabel } from "@/lib/fleet";
import { FleetFeedback, fleetError, type VehicleRecord } from "./shared";
import { PhotoGallery } from "./photos";
import { Gauge } from "lucide-react";
export function VehicleDetail({
  agencyId,
  vehicleId,
  permissions,
  currency,
}: {
  agencyId: Id<"agencies">;
  vehicleId: Id<"vehicles">;
  permissions: string[];
  currency: string;
}) {
  const confirm = useConfirm();
  const {
    locale,
    messages: { fleet: m, operations: o },
  } = useI18n();
  const record = useQuery(api.fleet.get, { agencyId, vehicleId });
  const catalogs = useQuery(api.fleetCatalogs.list, { agencyId });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStatus = useMutation(api.fleet.setStatus);
  const setVisibility = useMutation(api.fleet.setVisibility);
  if (record === undefined)
    return <WorkspaceLoading label={m.loading} variant="card" />;
  if (!record) return <p role="status">{m.notFound}</p>;
  const active = record.lifecycle === "active";
  const r = record;
  async function change(kind: "status" | "visibility") {
    if (
      kind === "status" &&
      active &&
      !(await confirm(m.archiveConfirm, {
        title: m.archive,
        actionLabel: m.archive,
        destructive: true,
      }))
    )
      return;
    setError(null);
    setPending(true);
    try {
      if (kind === "status")
        await setStatus({
          agencyId,
          vehicleId,
          expectedRevision: r.revision,
          lifecycle: active ? "archived" : "active",
        });
      else
        await setVisibility({
          agencyId,
          vehicleId,
          expectedRevision: r.revision,
          publicVisible: !r.publicVisible,
        });
    } catch (e) {
      setError(fleetError(e, m));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="fleet-stack">
      <header className="settings-section-topline">
        <div>
          <p className="fleet-number">
            <bdi>{r.fleetNumber}</bdi>
          </p>
          <h2 className="fleet-vehicle-title">
            {r.make} {r.model}
          </h2>
          <p className="text-muted-foreground">
            {r.year} · {r.trim} · {m[r.lifecycle]}
          </p>
        </div>
        <div className="fleet-actions">
          {[
            "maintenance.read",
            "inspection.read",
            "document.vehicle.read",
          ].some((permission) => permissions.includes(permission)) && (
            <Button asChild variant="outline">
              <Link href={`/app/${agencyId}/fleet/${vehicleId}/operations`}>
                <Gauge className="size-4" aria-hidden />
                {o.vehicleOperations}
              </Link>
            </Button>
          )}
          {permissions.includes("vehicle.update") && active && (
            <Button asChild>
              <Link href={`/app/${agencyId}/fleet/${vehicleId}/edit`}>
                {m.edit}
              </Link>
            </Button>
          )}
          {permissions.includes("vehicle.archive") && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => void change("status")}
            >
              {active ? m.archive : m.restore}
            </Button>
          )}
        </div>
      </header>
      <FleetFeedback error={error} onReload={() => setError(null)} />
      <div className="fleet-detail-grid">
        <Card className="settings-card">
          <h3>{m.specifications}</h3>
          <dl className="fleet-specs">
            {[
              [m.plate, r.plate],
              [m.vin, r.vin || "—"],
              [m.categoryId, localizedLabel(r.categoryLabels, locale)],
              [m.branchId, r.branchName],
              [m.transmission, m[r.transmission]],
              [m.fuel, m[r.fuel]],
              [m.seats, String(r.seats)],
              [m.doors, String(r.doors)],
              [m.color, r.color || "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <bdi>{value}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          <div className="fleet-feature-options">
            {catalogs
              ?.filter((c) => r.featureIds.includes(c.id))
              .map((c) => (
                <span className="fleet-badge" key={c.id}>
                  {localizedLabel(c.labels, locale)}
                </span>
              ))}
          </div>
        </Card>
        <Card className="settings-card">
          <h3>{m.publicVisible}</h3>
          <span className="fleet-badge self-start">
            {r.publicVisible ? m.visible : m.hidden}
          </span>
          <p className="text-sm text-muted-foreground">{m.visibilityHint}</p>
          {active && permissions.includes("vehicle.publish") && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => void change("visibility")}
            >
              {r.publicVisible ? m.hide : m.publish}
            </Button>
          )}
          {r.description && (
            <>
              <h3>{m.descriptionField}</h3>
              <p className="whitespace-pre-wrap wrap-anywhere">
                {r.description}
              </p>
            </>
          )}
          {r.notes && (
            <>
              <h3>{m.notes}</h3>
              <p className="whitespace-pre-wrap wrap-anywhere text-muted-foreground">
                {r.notes}
              </p>
            </>
          )}
        </Card>
      </div>
      <PhotoGallery
        agencyId={agencyId}
        record={r}
        canManage={active && permissions.includes("vehicle.update")}
      />
      {permissions.includes("vehicle.cost.read") && (
        <VehicleCost
          agencyId={agencyId}
          record={r}
          currency={currency}
          canManage={active && permissions.includes("agency.settings")}
        />
      )}
    </div>
  );
}
function VehicleCost({
  agencyId,
  record,
  currency,
  canManage,
}: {
  agencyId: Id<"agencies">;
  record: VehicleRecord;
  currency: string;
  canManage: boolean;
}) {
  const {
    locale,
    messages: { fleet: m },
  } = useI18n();
  const save = useMutation(api.fleet.setCost);
  const [amount, setAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState(currency);
  const [revision, setRevision] = useState(record.revision);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const cost = record.acquisitionCost;
  return (
    <Card className="settings-card">
      <h3>{m.cost}</h3>
      <p className="text-xl font-medium">
        {cost
          ? new Intl.NumberFormat(locale, {
              style: "currency",
              currency: cost.currency,
            }).format(cost.amountMinor / (cost.currency === "TND" ? 1000 : 100))
          : "—"}
      </p>
      {canManage && (
        <form
          className="fleet-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSaved(false);
            setPending(true);
            try {
              await save({
                agencyId,
                vehicleId: record.id,
                expectedRevision: revision,
                expectedCurrency: formCurrency,
                amountMinor: amount.trim()
                  ? decimalToMinor(amount, formCurrency)
                  : null,
              });
              setSaved(true);
              setRevision(revision + 1);
            } catch (cause) {
              setError(fleetError(cause, m));
            } finally {
              setPending(false);
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            {m.costHint.replace("{currency}", formCurrency)}
          </p>
          <Field className="fleet-field">
            <Label htmlFor="vehicle-cost">{m.costAmount}</Label>
            <Input
              id="vehicle-cost"
              inputMode="decimal"
              value={amount}
              onFocus={() => {
                if (!amount) setRevision(record.revision);
              }}
              onChange={(e) => {
                setAmount(e.target.value);
                setSaved(false);
              }}
              disabled={pending}
            />
          </Field>
          <FleetFeedback
            error={error}
            onReload={() => {
              setRevision(record.revision);
              setFormCurrency(currency);
              setAmount("");
              setError(null);
            }}
          />
          {saved && <p role="status">{m.saved}</p>}
          <Button className="self-start" disabled={pending}>
            {m.saveCost}
          </Button>
        </form>
      )}
    </Card>
  );
}
