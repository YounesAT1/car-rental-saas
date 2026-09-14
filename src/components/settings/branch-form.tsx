"use client";
import { useConfirm } from "@/components/confirmation-provider";
import { FieldSet } from "@/components/ui/field";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import {
  countries,
  defaultHours,
  settingsSchemas,
  timezones,
  type BranchValues,
} from "@/lib/agency-settings";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import {
  SaveFooter,
  SettingsField,
  settingsError,
  useUnsavedChanges,
} from "./form-fields";
import { HoursEditor } from "./hours-editor";
import type { BranchRecord } from "./branch-settings";

export function BranchForm({
  agencyId,
  branch,
  timezone,
  country,
  onClose,
}: {
  agencyId: Id<"agencies">;
  branch?: BranchRecord;
  timezone: string;
  country?: string;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const {
    locale,
    messages: { settings: m },
  } = useI18n();
  const create = useMutation(api.branches.create);
  const update = useMutation(api.branches.update);
  const [revision, setRevision] = useState(branch?.revision ?? 0);
  const [error, setError] = useState<string | null>(null);
  const schema = settingsSchemas(m.validation).branch;
  const defaults = branch
    ? schema.parse(branch)
    : {
        name: "",
        code: "",
        address: "",
        city: "",
        postalCode: "",
        phone: "",
        contactEmail: "",
        country: countries.find((c) => c === country) ?? "MA",
        timezone: timezones.find((t) => t === timezone) ?? "Africa/Casablanca",
        hours: defaultHours(),
        closures: [],
      };
  defaults.hours = [...defaults.hours].sort((a, b) => a.day - b.day);
  const form = useForm<BranchValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  useUnsavedChanges(form.formState.isDirty);
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  async function cancel() {
    if (!form.formState.isDirty || (await confirm(m.unsaved))) onClose();
  }
  async function submit(values: BranchValues) {
    setError(null);
    try {
      if (branch)
        await update({
          agencyId,
          branchId: branch.id,
          expectedRevision: revision,
          values,
        });
      else await create({ agencyId, values });
      form.reset(values);
      onClose();
    } catch (cause) {
      setError(settingsError(cause, m));
      if (String(cause).includes("BRANCH_CODE_TAKEN"))
        form.setError("code", { message: m.errors.code });
    }
  }
  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(submit)}
        className="settings-form"
      >
        <Card className="settings-card">
          <div className="settings-card-heading">
            <h2>{branch ? branch.name : m.addBranch}</h2>
            <p>{m.branchHint}</p>
          </div>
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField name="name" label={m.branchName} maxLength={160} />
            <SettingsField
              name="code"
              label={m.code}
              hint={m.codeHint}
              dir="ltr"
              maxLength={20}
            />
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
              name="phone"
              label={m.phone}
              type="tel"
              dir="ltr"
              maxLength={32}
            />
            <SettingsField
              name="contactEmail"
              label={m.email}
              type="email"
              dir="ltr"
              maxLength={254}
            />
          </FieldSet>
        </Card>
        <Card className="settings-card">
          <FieldSet disabled={form.formState.isSubmitting}>
            <HoursEditor />
          </FieldSet>
        </Card>
        <SaveFooter
          pending={form.formState.isSubmitting}
          dirty={!branch || form.formState.isDirty}
          error={error}
          label={branch ? m.save : m.addBranch}
          onCancel={cancel}
          onReset={
            branch
              ? () => {
                  form.reset(schema.parse(branch));
                  setRevision(branch.revision);
                  setError(null);
                }
              : undefined
          }
        />
      </form>
    </Form>
  );
}
