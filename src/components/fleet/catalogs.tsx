"use client";
import { useConfirm } from "@/components/confirmation-provider";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldSet } from "@/components/ui/field";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SettingsField,
  useUnsavedChanges,
} from "@/components/settings/form-fields";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { catalogSchema, localizedLabel } from "@/lib/fleet";
import { FleetFeedback, fleetError, type CatalogRecord } from "./shared";
export function FleetCatalogs({
  agencyId,
  canManage,
}: {
  agencyId: Id<"agencies">;
  canManage: boolean;
}) {
  const {
    locale,
    messages: { fleet: m },
  } = useI18n();
  const rows = useQuery(api.fleetCatalogs.list, { agencyId });
  const [editing, setEditing] = useState<
    "category" | "feature" | CatalogRecord | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const changeStatus = useMutation(api.fleetCatalogs.setStatus);
  if (!rows) return <WorkspaceLoading label={m.loading} variant="card" />;
  if (editing && canManage) {
    const current =
      typeof editing === "string"
        ? undefined
        : rows.find((r) => r.id === editing.id);
    return (
      <CatalogForm
        agencyId={agencyId}
        kind={typeof editing === "string" ? editing : editing.kind}
        record={current}
        onClose={() => setEditing(null)}
      />
    );
  }
  async function toggle(r: CatalogRecord) {
    setPending(true);
    setError(null);
    try {
      await changeStatus({
        agencyId,
        id: r.id,
        expectedRevision: r.revision,
        lifecycle: r.lifecycle === "active" ? "archived" : "active",
      });
    } catch (e) {
      setError(fleetError(e, m));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="fleet-stack">
      <p className="text-muted-foreground">{m.catalogHint}</p>
      <FleetFeedback error={error} />
      {(["category", "feature"] as const).map((kind) => (
        <Card className="settings-card" key={kind}>
          <div className="settings-section-topline">
            <h2>{kind === "category" ? m.category : m.features}</h2>
            {canManage && (
              <Button variant="outline" onClick={() => setEditing(kind)}>
                {kind === "category" ? m.addCategory : m.addFeature}
              </Button>
            )}
          </div>
          <div className="fleet-catalog-list">
            {rows.filter((r) => r.kind === kind).length === 0 ? (
              <p>{m.noCatalogs}</p>
            ) : (
              rows
                .filter((r) => r.kind === kind)
                .map((r) => (
                  <div className="fleet-catalog-row" key={r.id}>
                    <div className="min-w-0">
                      <span className="fleet-number">
                        <bdi>{r.code}</bdi>
                      </span>
                      <h3>{localizedLabel(r.labels, locale)}</h3>
                      <small className="text-muted-foreground">
                        {m[r.lifecycle]} ·{" "}
                        {r.publicVisible ? m.visible : m.hidden}
                      </small>
                    </div>
                    {canManage && (
                      <div className="fleet-actions">
                        <Button variant="ghost" onClick={() => setEditing(r)}>
                          {m.editCatalog}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={pending}
                          onClick={() => void toggle(r)}
                        >
                          {r.lifecycle === "active"
                            ? m.archiveCatalog
                            : m.restoreCatalog}
                        </Button>
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
function CatalogForm({
  agencyId,
  kind,
  record,
  onClose,
}: {
  agencyId: Id<"agencies">;
  kind: "category" | "feature";
  record?: CatalogRecord;
  onClose: () => void;
}) {
  const {
    messages: { fleet: m, settings: s },
  } = useI18n();
  const confirm = useConfirm();
  const save = useMutation(api.fleetCatalogs.save);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(record?.revision ?? 0);
  const form = useForm<z.infer<typeof catalogSchema>>({
    resolver: zodResolver(catalogSchema, { error: () => m.invalid }),
    defaultValues: record
      ? catalogSchema.parse(record)
      : { code: "", labels: { en: "", fr: "", ar: "" }, publicVisible: true },
  });
  useUnsavedChanges(form.formState.isDirty);
  return (
    <Form {...form}>
      <form
        className="fleet-stack"
        noValidate
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          try {
            await save({
              agencyId,
              id: record?.id,
              kind,
              expectedRevision: revision,
              values,
            });
            form.reset(values);
            onClose();
          } catch (e) {
            setError(fleetError(e, m));
          }
        })}
      >
        <Card className="settings-card">
          <h2>
            {record
              ? m.editCatalog
              : kind === "category"
                ? m.addCategory
                : m.addFeature}
          </h2>
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField
              name="code"
              label={m.code}
              maxLength={24}
              dir="ltr"
            />
            <SettingsField
              name="labels.en"
              label={m.labelEn}
              maxLength={160}
              dir="ltr"
            />
            <SettingsField
              name="labels.fr"
              label={m.labelFr}
              maxLength={160}
              dir="ltr"
            />
            <SettingsField
              name="labels.ar"
              label={m.labelAr}
              maxLength={160}
              dir="rtl"
            />
          </FieldSet>
          {form.formState.errors.labels && (
            <p role="alert" className="text-sm text-destructive">
              {m.invalid}
            </p>
          )}
          <FormField
            control={form.control}
            name="publicVisible"
            render={({ field }) => (
              <FormItem>
                <div className="fleet-checkbox">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true)
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      disabled={form.formState.isSubmitting}
                    />
                  </FormControl>
                  <FormLabel className="min-h-11 flex-1 font-normal">
                    {m.publicLabel}
                  </FormLabel>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </Card>
        <FleetFeedback
          error={error}
          onReload={
            record
              ? () => {
                  form.reset(catalogSchema.parse(record));
                  setRevision(record.revision);
                  setError(null);
                }
              : undefined
          }
        />
        <div className="fleet-actions justify-end">
          <Button
            variant="ghost"
            type="button"
            onClick={async () => {
              if (!form.formState.isDirty || (await confirm(s.unsaved)))
                onClose();
            }}
          >
            {m.cancel}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {m.save}
          </Button>
        </div>
      </form>
    </Form>
  );
}
