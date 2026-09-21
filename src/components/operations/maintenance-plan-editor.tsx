"use client";

import { useMutation, useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { operationsApi, type MaintenanceView } from "@/lib/operations-api";
import {
  localDateTimeValue,
  localInstant,
  localOffsets,
} from "@/lib/operations";
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
import { CostLines, costDraft, parseCostDraft } from "./cost-lines";

export function MaintenancePlanEditor({
  agencyId,
  record,
  timezone,
  onClose,
}: {
  agencyId: Id<"agencies">;
  record: MaintenanceView;
  timezone: string;
  onClose: () => void;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const [captured, setCaptured] = useState(record);
  const [title, setTitle] = useState(record.title);
  const [findings, setFindings] = useState(record.findings);
  const [vendor, setVendor] = useState(record.vendorId ?? "");
  const [scheduleIds, setScheduleIds] = useState(record.scheduleIds);
  const [start, setStart] = useState(
    record.startAt ? localDateTimeValue(record.startAt, timezone) : "",
  );
  const [end, setEnd] = useState(
    record.endAt ? localDateTimeValue(record.endAt, timezone) : "",
  );
  const [startOffset, setStartOffset] = useState("");
  const [endOffset, setEndOffset] = useState("");
  const [costs, setCosts] = useState(() =>
    costDraft(record.costLines ?? [], record.currency),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vendors = useQuery(operationsApi.catalogs.vendors, { agencyId });
  const schedules = useQuery(operationsApi.maintenance.schedules, {
    agencyId,
    vehicleId: record.vehicleId,
    active: true,
  });
  const save = useMutation(operationsApi.maintenance.save);
  const confirm = useConfirm();
  const fingerprint = JSON.stringify({
    title,
    findings,
    vendor,
    scheduleIds,
    start,
    end,
    startOffset,
    endOffset,
    costs,
  });
  const [initial, setInitial] = useState(fingerprint);
  const dirty = fingerprint !== initial;
  useUnsavedChanges(dirty);
  const stale =
    record.revision !== captured.revision || record.status !== "planned";
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      id: record._id,
      revision: captured.revision,
      fingerprint,
    }),
  );
  async function close() {
    if (
      dirty &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    onClose();
  }
  async function reload() {
    if (!(await confirm(m.discardDraft, { actionLabel: m.discardChanges })))
      return;
    const costs = costDraft(record.costLines ?? [], record.currency);
    const start = record.startAt
      ? localDateTimeValue(record.startAt, timezone)
      : "";
    const end = record.endAt ? localDateTimeValue(record.endAt, timezone) : "";
    setCaptured(record);
    setTitle(record.title);
    setFindings(record.findings);
    setVendor(record.vendorId ?? "");
    setScheduleIds(record.scheduleIds);
    setStart(start);
    setEnd(end);
    setStartOffset("");
    setEndOffset("");
    setCosts(costs);
    setError(null);
    setInitial(
      JSON.stringify({
        title: record.title,
        findings: record.findings,
        vendor: record.vendorId ?? "",
        scheduleIds: record.scheduleIds,
        start,
        end,
        startOffset: "",
        endOffset: "",
        costs,
      }),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Boolean(start) !== Boolean(end)) return setError(m.invalid);
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        id: record._id,
        expectedRevision: captured.revision,
        vehicleId: captured.vehicleId,
        title,
        findings,
        vendorId: vendor ? (vendor as Id<"maintenanceVendors">) : undefined,
        startAt: start
          ? localInstant(start, timezone, startOffset || undefined)
          : undefined,
        endAt: end
          ? localInstant(end, timezone, endOffset || undefined)
          : undefined,
        scheduleIds,
        costLines: parseCostDraft(costs, captured.currency),
        expectedCurrency: captured.currency,
        requestKey,
      });
      onClose();
    } catch (cause) {
      setError(
        String(cause).includes("CONFLICT")
          ? m.conflict
          : String(cause).includes("ALLOCATION")
            ? m.downtimeConflict
            : String(cause).includes("INVALID")
              ? m.invalid
              : m.failed,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="operations-form-card">
      <form
        className="operations-form"
        onSubmit={(event) => void submit(event)}
      >
        <h2>{m.editCatalog}</h2>
        <p>{m.timezoneHint.replace("{timezone}", timezone)}</p>
        <fieldset disabled={pending} className="operations-form">
          <div className="operations-fields">
            <Field>
              <Label htmlFor="maintenance-edit-title">{m.titleField}</Label>
              <Input
                autoFocus
                id="maintenance-edit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                required
              />
            </Field>
            <Field>
              <Label htmlFor="maintenance-edit-vendor">{m.vendor}</Label>
              <Select
                value={vendor || "none"}
                onValueChange={(value) =>
                  setVendor(value === "none" ? "" : value)
                }
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <SelectTrigger id="maintenance-edit-vendor" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{m.noVendor}</SelectItem>
                  {vendors
                    ?.filter(
                      (row) => row.active || row._id === captured.vendorId,
                    )
                    .map((row) => (
                      <SelectItem key={row._id} value={row._id}>
                        {row.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <PlanTime
              prefix="maintenance-edit-start"
              label={m.plannedStart}
              value={start}
              onChange={setStart}
              offset={startOffset}
              setOffset={setStartOffset}
              timezone={timezone}
            />
            <PlanTime
              prefix="maintenance-edit-end"
              label={m.plannedEnd}
              value={end}
              onChange={setEnd}
              offset={endOffset}
              setOffset={setEndOffset}
              timezone={timezone}
            />
            <Field className="operations-field-wide">
              <Label htmlFor="maintenance-edit-findings">{m.findings}</Label>
              <Textarea
                id="maintenance-edit-findings"
                value={findings}
                onChange={(event) => setFindings(event.target.value)}
                maxLength={4000}
              />
            </Field>
          </div>
          <fieldset className="operations-linked-schedules">
            <legend>{m.linkedSchedules}</legend>
            {schedules?.map((row) => (
              <Label className="operations-check" key={row._id}>
                <Checkbox
                  checked={scheduleIds.includes(row._id)}
                  onCheckedChange={(checked) =>
                    setScheduleIds((current) =>
                      checked === true
                        ? [...current, row._id]
                        : current.filter((id) => id !== row._id),
                    )
                  }
                />
                {row.service}
              </Label>
            ))}
          </fieldset>
          <CostLines
            prefix="maintenance-edit"
            currency={captured.currency}
            value={costs}
            onChange={setCosts}
            disabled={pending}
          />
        </fieldset>
        {(error || stale) && (
          <p role="alert" className="operations-feedback">
            {error ?? m.conflict}
          </p>
        )}
        <div className="operations-form-actions">
          <Button disabled={pending || stale || schedules === undefined}>
            {m.saveDraft}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void close()}
          >
            {m.cancel}
          </Button>
          {stale && record.status === "planned" && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void reload()}
            >
              {m.reload}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function PlanTime({
  prefix,
  label,
  value,
  onChange,
  offset,
  setOffset,
  timezone,
}: {
  prefix: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  offset: string;
  setOffset: (value: string) => void;
  timezone: string;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  const offsets = localOffsets(value, timezone);
  return (
    <Field>
      <Label htmlFor={prefix}>{label}</Label>
      <Input
        id={prefix}
        type="datetime-local"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOffset("");
        }}
      />
      {offsets.length > 1 && (
        <Select value={offset} onValueChange={setOffset}>
          <SelectTrigger
            aria-label={`${label}: ${m.offset}`}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {offsets.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
