"use client";
import { useConfirm } from "@/components/confirmation-provider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FieldSet, FieldLegend } from "@/components/ui/field";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import {
  SettingsField,
  useUnsavedChanges,
} from "@/components/settings/form-fields";
import { WorkspaceLoading } from "@/components/workspace-loading";
import {
  fleetSchema,
  fuels,
  transmissions,
  localizedLabel,
  type VehicleValues,
} from "@/lib/fleet";
import {
  FleetFeedback,
  fleetError,
  type VehicleRecord,
  type CatalogRecord,
  type BranchOption,
} from "./shared";
export function VehicleEditor({
  agencyId,
  vehicleId,
}: {
  agencyId: Id<"agencies">;
  vehicleId?: Id<"vehicles">;
}) {
  const {
    messages: { fleet: m },
  } = useI18n();
  const record = useQuery(
    api.fleet.get,
    vehicleId ? { agencyId, vehicleId } : "skip",
  );
  const catalogs = useQuery(api.fleetCatalogs.list, { agencyId });
  const branches = useQuery(api.fleet.options, { agencyId });
  if (!catalogs || !branches || (vehicleId && record === undefined))
    return <WorkspaceLoading label={m.loading} variant="card" />;
  if (vehicleId && !record) return <p role="status">{m.notFound}</p>;
  if (record?.lifecycle === "archived")
    return <p role="status">{m.archivedError}</p>;
  if (
    !vehicleId &&
    (!catalogs.some((c) => c.kind === "category" && c.lifecycle === "active") ||
      !branches.some((b) => b.status === "active"))
  )
    return (
      <div className="fleet-empty">
        <p>{m.requiredSetup}</p>
        <div className="fleet-actions">
          <Button asChild variant="outline">
            <Link href={`/app/${agencyId}/settings/branches`}>
              {m.manageBranches}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/app/${agencyId}/fleet/catalogs`}>{m.catalogs}</Link>
          </Button>
        </div>
      </div>
    );
  return (
    <VehicleForm
      agencyId={agencyId}
      record={record ?? undefined}
      catalogs={catalogs}
      branches={branches}
    />
  );
}
function VehicleForm({
  agencyId,
  record,
  catalogs,
  branches,
}: {
  agencyId: Id<"agencies">;
  record?: VehicleRecord;
  catalogs: CatalogRecord[];
  branches: BranchOption[];
}) {
  const {
    locale,
    messages: { fleet: m, settings: s },
  } = useI18n();
  const confirm = useConfirm();
  const router = useRouter();
  const save = useMutation(api.fleet.save);
  const [revision, setRevision] = useState(record?.revision ?? 0);
  const [error, setError] = useState<string | null>(null);
  const schema = fleetSchema(m.invalid);
  const defaults: VehicleValues = record
    ? schema.parse(record)
    : {
        fleetNumber: "",
        plate: "",
        vin: "",
        make: "",
        model: "",
        trim: "",
        year: new Date().getFullYear(),
        color: "",
        transmission: "manual",
        fuel: "diesel",
        seats: 5,
        doors: 5,
        branchId: branches.find((b) => b.status === "active")!.id,
        categoryId: catalogs.find(
          (c) => c.kind === "category" && c.lifecycle === "active",
        )!.id,
        featureIds: [],
        description: "",
        notes: "",
      };
  const form = useForm<VehicleValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  useUnsavedChanges(form.formState.isDirty);
  const selected = useWatch({ control: form.control, name: "featureIds" });
  async function submit(values: VehicleValues) {
    setError(null);
    try {
      const id = await save({
        agencyId,
        vehicleId: record?.id,
        expectedRevision: revision,
        values: {
          ...values,
          branchId: values.branchId as Id<"branches">,
          categoryId: values.categoryId as Id<"fleetCatalogs">,
          featureIds: values.featureIds as Id<"fleetCatalogs">[],
        },
      });
      form.reset(values);
      router.push(`/app/${agencyId}/fleet/${id}`);
    } catch (e) {
      setError(fleetError(e, m));
    }
  }
  return (
    <Form {...form}>
      <form
        noValidate
        className="fleet-stack"
        onSubmit={form.handleSubmit(submit)}
      >
        <div className="settings-section-topline">
          <h2 className="text-xl font-semibold">
            {record ? `${m.edit} · ${record.fleetNumber}` : m.add}
          </h2>
        </div>
        <Card className="settings-card">
          <h3>{m.identity}</h3>
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField
              name="fleetNumber"
              label={m.fleetNumber}
              maxLength={32}
              dir="ltr"
            />
            <SettingsField name="plate" label={m.plate} maxLength={32} />
            <SettingsField name="vin" label={m.vin} maxLength={17} dir="ltr" />
            <SettingsField name="make" label={m.make} maxLength={80} />
            <SettingsField name="model" label={m.model} maxLength={80} />
            <SettingsField name="trim" label={m.trim} maxLength={80} />
            <SettingsField
              name="year"
              label={m.year}
              type="number"
              min={1950}
              max={new Date().getFullYear() + 1}
            />
            <SettingsField name="color" label={m.color} maxLength={60} />
          </FieldSet>
        </Card>
        <Card className="settings-card">
          <h3>{m.specifications}</h3>
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField
              name="transmission"
              label={m.transmission}
              options={transmissions.map((value) => ({
                value,
                label: m[value],
              }))}
            />
            <SettingsField
              name="fuel"
              label={m.fuel}
              options={fuels.map((value) => ({ value, label: m[value] }))}
            />
            <SettingsField
              name="seats"
              label={m.seats}
              type="number"
              min={1}
              max={20}
            />
            <SettingsField
              name="doors"
              label={m.doors}
              type="number"
              min={2}
              max={6}
            />
          </FieldSet>
        </Card>
        <Card className="settings-card">
          <h3>{m.assignment}</h3>
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField
              name="branchId"
              label={m.branchId}
              options={branches
                .filter(
                  (b) => b.status === "active" || b.id === record?.branchId,
                )
                .map((b) => ({
                  value: b.id,
                  label:
                    b.name +
                    (b.status === "archived" ? ` (${m.archived})` : ""),
                }))}
            />
            <SettingsField
              name="categoryId"
              label={m.categoryId}
              options={catalogs
                .filter(
                  (c) =>
                    c.kind === "category" &&
                    (c.lifecycle === "active" || c.id === record?.categoryId),
                )
                .map((c) => ({
                  value: c.id,
                  label:
                    localizedLabel(c.labels, locale) +
                    (c.lifecycle === "archived" ? ` (${m.archived})` : ""),
                }))}
            />
          </FieldSet>
          <FieldSet disabled={form.formState.isSubmitting} className="mt-6">
            <FieldLegend variant="label">{m.features}</FieldLegend>
            <div className="fleet-feature-options">
              {catalogs
                .filter(
                  (c) =>
                    c.kind === "feature" &&
                    (c.lifecycle === "active" ||
                      record?.featureIds.includes(c.id)),
                )
                .map((c) => (
                  <Label
                    key={c.id}
                    htmlFor={`feature-${c.id}`}
                    className="fleet-checkbox"
                  >
                    <Checkbox
                      id={`feature-${c.id}`}
                      disabled={form.formState.isSubmitting}
                      checked={selected.includes(c.id)}
                      onCheckedChange={(checked) =>
                        form.setValue(
                          "featureIds",
                          checked === true
                            ? [...selected, c.id]
                            : selected.filter((id) => id !== c.id),
                          { shouldDirty: true, shouldValidate: true },
                        )
                      }
                    />
                    {localizedLabel(c.labels, locale)}
                  </Label>
                ))}
            </div>
            {form.formState.errors.featureIds && (
              <p role="alert" className="text-destructive text-sm">
                {m.invalid}
              </p>
            )}
          </FieldSet>
        </Card>
        <Card className="settings-card">
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField
              name="description"
              label={m.descriptionField}
              multiline
              maxLength={3000}
            />
            <SettingsField
              name="notes"
              label={m.notes}
              multiline
              maxLength={3000}
            />
          </FieldSet>
        </Card>
        <FleetFeedback
          error={error}
          onReload={
            record
              ? () => {
                  form.reset(schema.parse(record));
                  setRevision(record.revision);
                  setError(null);
                }
              : undefined
          }
        />
        <div className="fleet-actions justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={form.formState.isSubmitting}
            onClick={async () => {
              if (!form.formState.isDirty || (await confirm(s.unsaved)))
                router.push(
                  `/app/${agencyId}/fleet${record ? `/${record.id}` : ""}`,
                );
            }}
          >
            {m.cancel}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? m.loading : record ? m.save : m.add}
          </Button>
        </div>
      </form>
    </Form>
  );
}
