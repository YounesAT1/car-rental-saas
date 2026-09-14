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
  decimalToMinor,
  draftPolicy,
  minorToDecimal,
  policyFormSchema,
  type PolicyFormValues,
} from "@/lib/agency-settings";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import {
  SaveFooter,
  SettingsField,
  settingsError,
  useUnsavedChanges,
} from "./form-fields";
import type { CurrentPolicy } from "./policy-settings";

function valuesFor(current: CurrentPolicy): PolicyFormValues {
  const data = current.policy ?? draftPolicy;
  return {
    ...data,
    depositAmount: minorToDecimal(
      current.policy && current.policy.currency !== current.currency
        ? 0
        : data.depositAmountMinor,
      current.currency,
    ),
  };
}

export function PolicyForm({
  agencyId,
  current,
  onClose,
}: {
  agencyId: Id<"agencies">;
  current: CurrentPolicy;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const {
    messages: { settings: m },
  } = useI18n();
  const publish = useMutation(api.agencySettings.publishPolicy);
  const [base, setBase] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema(m.validation, base.currency)),
    defaultValues: valuesFor(base),
  });
  useUnsavedChanges(form.formState.isDirty);
  async function submit(values: PolicyFormValues) {
    setError(null);
    const { depositAmount, ...rest } = values;
    try {
      await publish({
        agencyId,
        expectedVersion: base.policy?.version ?? 0,
        expectedAgencyRevision: base.agencyRevision,
        values: {
          ...rest,
          depositAmountMinor: decimalToMinor(depositAmount, base.currency),
        },
      });
      form.reset(values);
      onClose();
    } catch (cause) {
      setError(settingsError(cause, m));
    }
  }
  return (
    <Form {...form}>
      <form
        className="settings-form"
        noValidate
        onSubmit={form.handleSubmit(submit)}
      >
        <div className="settings-section-topline">
          <div>
            <h2>{m.newVersion}</h2>
            <p>{m.publishHint}</p>
          </div>
        </div>
        {base.policy && base.policy.currency !== base.currency && (
          <p role="status" className="settings-notice">
            {m.currencyChanged}
          </p>
        )}
        <Card className="settings-card">
          <div className="settings-card-heading">
            <h3>{m.eligibility}</h3>
          </div>
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField
              name="minimumDriverAge"
              label={m.minimumDriverAge}
              type="number"
              min={18}
              max={99}
            />
            <SettingsField
              name="minimumLicenseYears"
              label={m.minimumLicenseYears}
              type="number"
              min={0}
              max={30}
            />
            <SettingsField
              name="maximumRentalDays"
              label={m.maximumRentalDays}
              type="number"
              min={1}
              max={365}
            />
            <SettingsField
              name="bookingHorizonDays"
              label={m.bookingHorizonDays}
              type="number"
              min={1}
              max={730}
            />
          </FieldSet>
        </Card>
        <Card className="settings-card">
          <div className="settings-card-heading">
            <h3>{m.operations}</h3>
          </div>
          <FieldSet
            disabled={form.formState.isSubmitting}
            className="settings-fields grid gap-6"
          >
            <SettingsField
              name="preparationMinutes"
              label={m.preparationMinutes}
              type="number"
              min={0}
              max={1440}
            />
            <SettingsField
              name="graceMinutes"
              label={m.graceMinutes}
              type="number"
              min={0}
              max={1440}
            />
            <SettingsField
              name="includedKmPerDay"
              label={m.includedKmPerDay}
              type="number"
              min={0}
              max={10000}
              hint={m.mileageHint}
            />
            <SettingsField
              name="fuelPolicy"
              label={m.fuelPolicy}
              options={[
                { value: "full_to_full", label: m.fullToFull },
                { value: "same_to_same", label: m.sameToSame },
              ]}
            />
            <SettingsField
              name="depositAmount"
              label={m.deposit.replace("{currency}", base.currency)}
              hint={`${m.depositHint} ${m.range.replace("{min}", "0").replace("{max}", minorToDecimal(100_000_000, base.currency))}`}
              dir="ltr"
              inputMode="decimal"
            />
            <SettingsField
              name="freeCancellationHours"
              label={m.freeCancellationHours}
              type="number"
              min={0}
              max={8760}
            />
          </FieldSet>
        </Card>
        <Card className="settings-card">
          <div className="settings-card-heading">
            <h3>{m.terms}</h3>
            <p>{m.termsHint}</p>
          </div>
          <FieldSet disabled={form.formState.isSubmitting} className="gap-6">
            <SettingsField
              name="terms.en"
              label={m.termsEnglish}
              multiline
              dir="ltr"
              maxLength={8000}
            />
            <SettingsField
              name="terms.fr"
              label={m.termsFrench}
              multiline
              dir="ltr"
              maxLength={8000}
            />
            <SettingsField
              name="terms.ar"
              label={m.termsArabic}
              multiline
              dir="rtl"
              maxLength={8000}
            />
          </FieldSet>
        </Card>
        <SaveFooter
          pending={form.formState.isSubmitting}
          dirty
          error={error}
          label={m.publish}
          onCancel={async () => {
            if (!form.formState.isDirty || (await confirm(m.unsaved)))
              onClose();
          }}
          onReset={() => {
            setBase(current);
            form.reset(valuesFor(current));
            setError(null);
          }}
        />
      </form>
    </Form>
  );
}
