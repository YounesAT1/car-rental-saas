"use client";

import { useMutation } from "convex/react";
import { FormEvent, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { DamageView } from "@/lib/operations-api";
import { decimalToMinor, minorToDecimal } from "@/lib/agency-settings";
import { useOperationRequestKey } from "@/lib/use-operation-request-key";
import { useConfirm } from "@/components/confirmation-provider";
import { useUnsavedChanges } from "@/components/settings/form-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/client";

export function DamageEditor({
  agencyId,
  record,
}: {
  agencyId: Id<"agencies">;
  record: DamageView;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const [captured, setCaptured] = useState<DamageView | null>(null);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState(record.severity);
  const [responsibility, setResponsibility] = useState(record.responsibility);
  const [disputed, setDisputed] = useState(record.disputed);
  const [estimate, setEstimate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useMutation(api.damage.update);
  const confirm = useConfirm();
  const dirty = Boolean(
    captured &&
    (location !== captured.location ||
      description !== captured.description ||
      severity !== captured.severity ||
      responsibility !== captured.responsibility ||
      disputed !== captured.disputed ||
      estimate !==
        (captured.estimateMinor === null
          ? ""
          : minorToDecimal(captured.estimateMinor, captured.currency))),
  );
  useUnsavedChanges(dirty);
  const stale =
    captured &&
    (captured.revision !== record.revision || record.status === "resolved");
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      id: record._id,
      revision: captured?.revision,
      location,
      description,
      severity,
      responsibility,
      disputed,
      estimate,
    }),
  );
  function load() {
    setCaptured(record);
    setLocation(record.location);
    setDescription(record.description);
    setSeverity(record.severity);
    setResponsibility(record.responsibility);
    setDisputed(record.disputed);
    setEstimate(
      record.estimateMinor === null
        ? ""
        : minorToDecimal(record.estimateMinor, record.currency),
    );
    setError(null);
  }
  async function close() {
    if (
      dirty &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setCaptured(null);
    setError(null);
    requestAnimationFrame(() =>
      document.getElementById("damage-edit-open")?.focus(),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captured || stale) return;
    setPending(true);
    setError(null);
    try {
      await update({
        agencyId,
        id: record._id,
        expectedRevision: captured.revision,
        location,
        description,
        severity,
        responsibility,
        disputed,
        estimateMinor: estimate.trim()
          ? decimalToMinor(estimate, record.currency)
          : undefined,
        expectedCurrency: record.currency,
        requestKey,
      });
      setCaptured(null);
    } catch (cause) {
      setError(
        String(cause).includes("CONFLICT")
          ? m.conflict
          : String(cause).includes("INVALID")
            ? m.invalid
            : m.failed,
      );
    } finally {
      setPending(false);
    }
  }
  if (!captured)
    return (
      <Button id="damage-edit-open" variant="outline" onClick={load}>
        {m.editCatalog}
      </Button>
    );
  return (
    <Card className="operations-form-card">
      <form
        className="operations-form"
        onSubmit={(event) => void submit(event)}
      >
        <h2>{m.damages}</h2>
        <fieldset disabled={pending} className="operations-fields">
          <Field>
            <Label htmlFor="damage-edit-location">{m.damageLocation}</Label>
            <Input
              autoFocus
              id="damage-edit-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={160}
              required
            />
          </Field>
          <Field>
            <Label htmlFor="damage-edit-severity">{m.priority}</Label>
            <Select
              value={severity}
              onValueChange={(value) => setSeverity(value as typeof severity)}
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              <SelectTrigger id="damage-edit-severity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="notice">{m.normal}</SelectItem>
                <SelectItem value="blocking">{m.blocked}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="damage-edit-responsibility">
              {m.responsibility}
            </Label>
            <Select
              value={responsibility}
              onValueChange={(value) =>
                setResponsibility(value as typeof responsibility)
              }
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              <SelectTrigger id="damage-edit-responsibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">
                  {m.unknownResponsibility}
                </SelectItem>
                <SelectItem value="agency">{m.agencyResponsibility}</SelectItem>
                <SelectItem value="third_party">
                  {m.thirdPartyResponsibility}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="damage-edit-estimate">
              {m.estimate} ({record.currency})
            </Label>
            <Input
              id="damage-edit-estimate"
              inputMode="decimal"
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
            />
          </Field>
          <Label className="operations-check">
            <Checkbox
              checked={disputed}
              onCheckedChange={(value) => setDisputed(value === true)}
            />
            {m.disputed}
          </Label>
          <Field className="operations-field-wide">
            <Label htmlFor="damage-edit-description">
              {m.descriptionField}
            </Label>
            <Textarea
              id="damage-edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              required
            />
          </Field>
        </fieldset>
        {(error || stale) && (
          <p role="alert" className="operations-feedback">
            {error ?? m.conflict}
          </p>
        )}
        <div className="operations-form-actions">
          <Button disabled={pending || Boolean(stale)}>{m.saveDraft}</Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void close()}
          >
            {m.cancel}
          </Button>
          {stale && record.status !== "resolved" && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={async () => {
                if (
                  await confirm(m.discardDraft, {
                    actionLabel: m.discardChanges,
                  })
                )
                  load();
              }}
            >
              {m.reload}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
