"use client";

import { useMutation } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useConfirm } from "@/components/confirmation-provider";
import { useUnsavedChanges } from "@/components/settings/form-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  distanceMeters,
  localDateTimeValue,
  localInstant,
  localOffsets,
} from "@/lib/operations";
import { useOperationRequestKey } from "@/lib/use-operation-request-key";

type Mileage = Doc<"vehicleMileageLogs">;

export function MileageHistory({
  agencyId,
  vehicleId,
  timezone,
  rows,
  latestId,
  lifetimeMeters,
  canCorrect,
  activeVehicle,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  agencyId: Id<"agencies">;
  vehicleId: Id<"vehicles">;
  timezone: string;
  rows: Mileage[];
  latestId?: Id<"vehicleMileageLogs">;
  lifetimeMeters?: number;
  canCorrect: boolean;
  activeVehicle: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const [selected, setSelected] = useState<Mileage | "replacement" | null>(
    null,
  );
  const trigger = useRef<HTMLElement | null>(null);
  const format = (meters: number) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(meters / 1000)} km`;
  return (
    <Card className="operations-history-card">
      <div className="operations-schedule-heading">
        <h2>{m.mileage}</h2>
        {canCorrect && activeVehicle && !selected && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setSelected("replacement");
            }}
          >
            {m.replaceOdometer}
          </Button>
        )}
      </div>
      {canCorrect && selected && (
        <MileageCorrection
          key={typeof selected === "string" ? selected : selected._id}
          agencyId={agencyId}
          vehicleId={vehicleId}
          timezone={timezone}
          original={typeof selected === "string" ? null : selected}
          latest={
            typeof selected === "string"
              ? undefined
              : rows.find((row) => row._id === selected._id)
          }
          lifetimeMeters={lifetimeMeters}
          onClose={() => {
            setSelected(null);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        />
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{m.noMileage}</p>
      ) : (
        <div className="operations-history-list">
          {rows.map((row) => (
            <div key={row._id} className="flex-wrap" data-mileage-id={row._id}>
              <div>
                <strong>
                  <bdi>
                    {new Intl.NumberFormat(locale).format(row.value)} {row.unit}
                  </bdi>
                </strong>
                <span>
                  {m.lifetimeDistance}: <bdi>{format(row.meters)}</bdi> ·{" "}
                  {row.kind === "replacement"
                    ? m.replacement
                    : row.kind === "correction"
                      ? m.correction
                      : m.observation}
                </span>
                <span>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "medium",
                    timeZone: timezone,
                  }).format(row.observedAt)}
                  {row.reason ? ` · ${row.reason}` : ""}
                </span>
                {!row.active && (
                  <span className="operations-badge">{m.superseded}</span>
                )}
              </div>
              {canCorrect &&
                row.active &&
                (row.kind !== "replacement" || row._id === latestId) &&
                !selected && (
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={(event) => {
                      trigger.current = event.currentTarget;
                      setSelected(row);
                    }}
                  >
                    {m.correctMileage}
                  </Button>
                )}
            </div>
          ))}
        </div>
      )}
      {canLoadMore && (
        <Button
          variant="outline"
          disabled={loadingMore || Boolean(selected)}
          onClick={onLoadMore}
        >
          {m.loadMore}
        </Button>
      )}
    </Card>
  );
}

function MileageCorrection({
  agencyId,
  vehicleId,
  timezone,
  original,
  latest,
  lifetimeMeters,
  onClose,
}: {
  agencyId: Id<"agencies">;
  vehicleId: Id<"vehicles">;
  timezone: string;
  original: Mileage | null;
  latest?: Mileage;
  lifetimeMeters?: number;
  onClose: () => void;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const save = useMutation(api.mileage.save);
  const confirm = useConfirm();
  const replacement = original === null || original.kind === "replacement";
  const [value, setValue] = useState(original ? String(original.value) : "0");
  const [unit, setUnit] = useState<"km" | "mi">(original?.unit ?? "km");
  const [prior, setPrior] = useState(
    String((original?.meters ?? lifetimeMeters ?? 0) / 1000),
  );
  const [observedAt, setObservedAt] = useState(() =>
    localDateTimeValue(
      original?.observedAt ?? Date.now(),
      timezone,
      "millisecond",
    ),
  );
  const [offset, setOffset] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const offsets = localOffsets(observedAt, timezone);
  const fingerprint = JSON.stringify({
    value,
    unit,
    prior,
    observedAt,
    offset,
    reason,
    id: original?._id,
    revision: original?.revision,
  });
  const [initial] = useState(fingerprint);
  const dirty = fingerprint !== initial;
  useUnsavedChanges(dirty);
  const requestKey = useOperationRequestKey(fingerprint);
  const stale =
    original && (!latest?.active || latest.revision !== original.revision);
  async function close() {
    if (
      !dirty ||
      (await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      onClose();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let instant: number;
    let priorLifetimeMeters: number | undefined;
    try {
      if (!value.trim() || !reason.trim() || (replacement && !prior.trim()))
        throw new Error();
      distanceMeters(Number(value), unit);
      priorLifetimeMeters = replacement
        ? distanceMeters(Number(prior), "km")
        : undefined;
      instant =
        original?.observedAt ??
        localInstant(observedAt, timezone, offset || undefined);
      if (instant > Date.now()) throw new Error();
    } catch {
      setInvalid(true);
      return;
    }
    if (stale) return setError(m.conflict);
    setPending(true);
    setError(null);
    setInvalid(false);
    try {
      await save({
        agencyId,
        vehicleId,
        value: Number(value),
        unit,
        observedAt: instant,
        reason,
        supersedesId: original?._id,
        expectedRevision: original?.revision ?? 0,
        replacement,
        priorLifetimeMeters,
        requestKey,
      });
      onClose();
    } catch (cause) {
      const text = String(cause);
      setError(
        text.includes("MILEAGE_TIME_CONFLICT")
          ? m.dateConflict
          : text.includes("MILEAGE_EPOCH_CONFLICT")
            ? m.odometerConflict
            : text.includes("MILEAGE_INVALID")
              ? m.mileageConflict
              : text.includes("CONFLICT")
                ? m.conflict
                : m.failed,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="operations-form operations-correction-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="settings-card-heading">
        <h3>{replacement ? m.replaceOdometer : m.correctMileage}</h3>
        <p>{replacement ? m.replacementHint : m.correctionHint}</p>
      </div>
      <fieldset className="operations-fields" disabled={pending}>
        <Field>
          <Label htmlFor="correction-value">
            {replacement ? m.odometerBaseline : m.value}
          </Label>
          <Input
            id="correction-value"
            type="number"
            min={0}
            step="any"
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="correction-unit">{m.unit}</Label>
          <Select
            value={unit}
            onValueChange={(value) => setUnit(value as "km" | "mi")}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <SelectTrigger id="correction-unit" className="w-full min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="km">{m.kilometers}</SelectItem>
              <SelectItem value="mi">{m.miles}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {replacement && (
          <Field>
            <Label htmlFor="correction-prior">{m.priorLifetime} (km)</Label>
            <Input
              id="correction-prior"
              type="number"
              min={0}
              step="any"
              required
              value={prior}
              onChange={(event) => setPrior(event.target.value)}
            />
          </Field>
        )}
        <Field>
          <Label htmlFor="correction-date">{m.observedAt}</Label>
          <Input
            id="correction-date"
            type="datetime-local"
            step="0.001"
            readOnly={Boolean(original)}
            required
            value={observedAt}
            onChange={(event) => {
              setObservedAt(event.target.value);
              setOffset("");
            }}
          />
          <p className="operations-schedule-hint">
            {m.timezoneHint.replace("{timezone}", timezone)}
          </p>
        </Field>
        {!original && offsets.length > 1 && (
          <Field>
            <Label htmlFor="correction-offset">{m.offset}</Label>
            <Select value={offset} onValueChange={setOffset}>
              <SelectTrigger id="correction-offset" className="w-full min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {offsets.map((value) => (
                  <SelectItem value={value} key={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field className="operations-field-wide">
          <Label htmlFor="correction-reason">{m.reason}</Label>
          <Textarea
            id="correction-reason"
            required
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </fieldset>
      {(error || invalid || stale) && (
        <p role="alert" className="operations-feedback">
          {error ?? (stale ? m.conflict : m.invalid)}
        </p>
      )}
      <div className="operations-form-actions">
        <Button disabled={pending || Boolean(stale)}>
          {pending ? m.saving : m.saveCorrection}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => void close()}
        >
          {m.cancel}
        </Button>
        {stale && (
          <Button type="button" variant="outline" onClick={() => void close()}>
            {m.reload}
          </Button>
        )}
      </div>
    </form>
  );
}
