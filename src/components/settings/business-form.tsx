"use client";
import { FieldSet } from "@/components/ui/field";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import {
  countries,
  currencies,
  settingsSchemas,
  timezones,
  type BusinessValues,
} from "@/lib/agency-settings";
import { languageNames } from "@/i18n/config";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { WorkspaceLoading } from "@/components/workspace-loading";
import {
  SaveFooter,
  SettingsField,
  settingsError,
  useUnsavedChanges,
} from "./form-fields";

export function BusinessSettings({ agencyId }: { agencyId: Id<"agencies"> }) {
  const { messages } = useI18n();
  const data = useQuery(api.agencySettings.getBusiness, { agencyId });
  if (!data)
    return (
      <WorkspaceLoading label={messages.settings.loading} variant="card" />
    );
  return <BusinessForm data={data} />;
}

function BusinessForm({
  data,
}: {
  data: FunctionReturnType<typeof api.agencySettings.getBusiness>;
}) {
  const {
    locale,
    messages: { settings: m },
  } = useI18n();
  const save = useMutation(api.agencySettings.saveBusiness);
  const [revision, setRevision] = useState(data.revision);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const schema = settingsSchemas(m.validation).business;
  const form = useForm<BusinessValues>({
    resolver: zodResolver(schema),
    defaultValues: schema.parse(data),
  });
  useUnsavedChanges(form.formState.isDirty);
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  async function submit(values: BusinessValues) {
    setError(null);
    setSaved(false);
    try {
      const result = await save({
        agencyId: data.id,
        expectedRevision: revision,
        values,
      });
      setRevision(result.revision);
      form.reset(schema.parse(result));
      setSaved(true);
    } catch (cause) {
      setError(settingsError(cause, m));
    }
  }
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit)}
        noValidate
        className="settings-form"
      >
        <Card className="settings-card">
          <div className="settings-card-heading">
            <h2>{m.identity}</h2>
            <p>{m.identityHint}</p>
          </div>
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField name="name" label={m.name} maxLength={160} />
            <SettingsField
              name="legalName"
              label={m.legalName}
              maxLength={160}
            />
            <SettingsField
              name="contactEmail"
              label={m.email}
              type="email"
              dir="ltr"
              maxLength={254}
            />
            <SettingsField
              name="phone"
              label={m.phone}
              type="tel"
              dir="ltr"
              maxLength={32}
            />
            <SettingsField
              name="website"
              label={m.website}
              dir="ltr"
              maxLength={240}
            />
          </FieldSet>
        </Card>
        <Card className="settings-card">
          <div className="settings-card-heading">
            <h2>{m.regional}</h2>
            <p>{m.regionalHint}</p>
          </div>
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField name="address" label={m.address} maxLength={240} />
            <SettingsField name="city" label={m.city} maxLength={100} />
            <SettingsField
              name="postalCode"
              label={m.postalCode}
              maxLength={20}
            />
            <SettingsField
              name="country"
              label={m.country}
              options={countries.map((c) => ({
                value: c,
                label: regionNames.of(c) ?? c,
              }))}
            />
            <SettingsField
              name="timezone"
              label={m.timezone}
              options={timezones.map((t) => ({
                value: t,
                label: t.replaceAll("_", " "),
              }))}
            />
            <SettingsField
              name="currency"
              label={m.currency}
              options={currencies.map((c) => ({ value: c, label: c }))}
            />
            <SettingsField
              name="defaultLocale"
              label={m.defaultLocale}
              hint={m.localeHint}
              options={Object.entries(languageNames).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </FieldSet>
        </Card>
        <SaveFooter
          pending={form.formState.isSubmitting}
          dirty={form.formState.isDirty}
          error={error}
          saved={saved}
          onReset={() => {
            form.reset(schema.parse(data));
            setRevision(data.revision);
            setError(null);
          }}
        />
      </form>
    </Form>
  );
}
