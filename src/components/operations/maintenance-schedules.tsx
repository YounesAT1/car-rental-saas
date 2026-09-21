"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { WorkspaceLoading } from "@/components/workspace-loading";
import { useI18n } from "@/i18n/client";
import { operationsApi } from "@/lib/operations-api";
import { distanceMeters, dueState, MAX_METERS } from "@/lib/operations";
import { useOperationRequestKey } from "@/lib/use-operation-request-key";

type Schedule = Doc<"maintenanceSchedules">;
type OperationMessages = ReturnType<typeof useI18n>["messages"]["operations"];

function scheduleError(cause: unknown, m: OperationMessages) {
  const text = String(cause);
  if (text.includes("MAINTENANCE_SCHEDULE_HAS_WORK")) return m.scheduleHasWork;
  if (text.includes("CONFLICT")) return m.conflict;
  if (text.includes("OPERATIONS_LIMIT")) return m.scheduleLimit;
  return m.failed;
}

export function MaintenanceSchedules({
  agencyId,
  requestedVehicleId,
}: {
  agencyId: string;
  requestedVehicleId?: string;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  const id = agencyId as Id<"agencies">;
  const workspace = useQuery(api.identity.getWorkspace, { agencyId: id });
  return (
    <section className="workspace-page operations-page">
      <Link
        href={`/app/${agencyId}/maintenance`}
        className="workspace-backlink inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft className="directional-icon size-4" aria-hidden />
        {m.maintenance}
      </Link>
      <header className="settings-heading operations-heading">
        <p className="eyebrow">{workspace?.agency.name ?? m.maintenance}</p>
        <h1>{m.schedules}</h1>
        <p>{m.scheduleHint}</p>
      </header>
      {workspace === undefined ? (
        <WorkspaceLoading label={m.loading} variant="card" />
      ) : !workspace?.permissions.includes("maintenance.read") ? (
        <Card className="settings-card">
          <p role="status">{m.denied}</p>
        </Card>
      ) : (
        <ScheduleWorkspace
          key={`${agencyId}:${requestedVehicleId ?? ""}`}
          agencyId={id}
          requestedVehicleId={requestedVehicleId}
          canManage={workspace.permissions.includes("maintenance.manage")}
        />
      )}
    </section>
  );
}

function ScheduleWorkspace({
  agencyId,
  requestedVehicleId,
  canManage,
}: {
  agencyId: Id<"agencies">;
  requestedVehicleId?: string;
  canManage: boolean;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const router = useRouter();
  const confirm = useConfirm();
  const vehicles = useQuery(operationsApi.catalogs.vehicles, { agencyId });
  const vehicleId = vehicles?.find(
    (vehicle) => vehicle.id === requestedVehicleId,
  )?.id;
  const [active, setActive] = useState(true);
  const [editor, setEditor] = useState<Schedule | "new" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [saved, setSaved] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const { results, loadMore, status } = usePaginatedQuery(
    api.maintenance.listSchedules,
    vehicleId ? { agencyId, vehicleId, active } : "skip",
    { initialNumItems: 20 },
  );
  const summary = useQuery(
    api.operations.summary,
    vehicleId ? { agencyId, vehicleId } : "skip",
  );

  async function discard() {
    if (editorPending) return false;
    if (
      dirty &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return false;
    setEditor(null);
    setDirty(false);
    setSaved(false);
    return true;
  }
  async function openEditor(value: Schedule | "new") {
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (await discard()) {
      returnFocus.current = trigger;
      setEditor(value);
    }
  }
  async function closeEditor() {
    if (await discard())
      requestAnimationFrame(() => {
        const target = returnFocus.current?.isConnected
          ? returnFocus.current
          : addButton.current;
        target?.focus();
      });
  }

  return (
    <div className="operations-stack">
      <Card className="settings-card">
        <Field>
          <Label htmlFor="schedule-vehicle">{m.vehicle}</Label>
          <Select
            value={vehicleId ?? ""}
            dir={locale === "ar" ? "rtl" : "ltr"}
            disabled={vehicles === undefined || editorPending}
            onValueChange={(value) => {
              void (async () => {
                if (value !== vehicleId && (await discard()))
                  router.push(
                    `/app/${agencyId}/maintenance/schedules?vehicleId=${value}`,
                  );
              })();
            }}
          >
            <SelectTrigger id="schedule-vehicle" className="w-full min-h-11">
              <SelectValue placeholder={m.selectVehicle} />
            </SelectTrigger>
            <SelectContent>
              {vehicles?.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                  {!vehicle.active ? ` · ${m.archived}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Card>
      {vehicleId ? (
        <>
          <div className="operations-toolbar">
            <div
              className="operations-segment"
              role="group"
              aria-label={m.schedules}
            >
              {[true, false].map((value) => (
                <Button
                  key={String(value)}
                  type="button"
                  variant={active === value ? "secondary" : "ghost"}
                  aria-pressed={active === value}
                  disabled={editorPending}
                  onClick={() => {
                    void (async () => {
                      if (value !== active && (await discard()))
                        setActive(value);
                    })();
                  }}
                >
                  {value ? m.active : m.archived}
                </Button>
              ))}
            </div>
            {canManage && (
              <Button
                ref={addButton}
                disabled={editorPending}
                className="rounded-full min-h-11"
                onClick={() => void openEditor("new")}
              >
                <Plus className="size-4" aria-hidden />
                {m.addSchedule}
              </Button>
            )}
          </div>
          {saved && (
            <p className="operations-saved" role="status">
              {m.saved}
            </p>
          )}
          {canManage && editor && (
            <ScheduleEditor
              key={editor === "new" ? "new" : editor._id}
              agencyId={agencyId}
              vehicleId={vehicleId}
              original={editor === "new" ? null : editor}
              onDirtyChange={setDirty}
              onPendingChange={setEditorPending}
              onCancel={() => void closeEditor()}
              onSaved={() => {
                setEditor(null);
                setDirty(false);
                setEditorPending(false);
                setSaved(true);
              }}
            />
          )}
          {status === "LoadingFirstPage" ? (
            <WorkspaceLoading label={m.loading} variant="card" />
          ) : results.length === 0 ? (
            <div className="operations-empty">
              <CalendarClock className="size-6" aria-hidden />
              <p>{m.noSchedules}</p>
            </div>
          ) : (
            <div className="operations-stack">
              {results.map((schedule) => (
                <ScheduleCard
                  key={schedule._id}
                  schedule={schedule}
                  agencyId={agencyId}
                  mileage={summary?.guard?.mileageMeters}
                  now={now}
                  canManage={canManage}
                  disabled={editorPending}
                  onEdit={() => void openEditor(schedule)}
                />
              ))}
            </div>
          )}
          {(status === "CanLoadMore" || status === "LoadingMore") && (
            <Button
              variant="outline"
              className="min-h-11 justify-self-start"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(20)}
            >
              {m.loadMore}
            </Button>
          )}
          <Button
            variant="outline"
            asChild
            className="min-h-11 justify-self-start"
          >
            <Link href={`/app/${agencyId}/fleet/${vehicleId}/operations`}>
              {m.vehicleOperations}
            </Link>
          </Button>
        </>
      ) : (
        <div className="operations-empty">
          <CalendarClock className="size-6" aria-hidden />
          <p>{m.selectVehicle}</p>
        </div>
      )}
    </div>
  );
}

function ScheduleCard({
  schedule,
  agencyId,
  mileage,
  now,
  canManage,
  disabled,
  onEdit,
}: {
  schedule: Schedule;
  agencyId: Id<"agencies">;
  mileage?: number;
  now: number;
  canManage: boolean;
  disabled: boolean;
  onEdit: () => void;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const confirm = useConfirm();
  const save = useMutation(api.maintenance.saveSchedule);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      id: schedule._id,
      revision: schedule.revision,
      active: !schedule.active,
    }),
  );
  const state = dueState(schedule, mileage, now);
  const Icon = state === "upcoming" ? CheckCircle2 : AlertTriangle;
  const formatted = (value: number) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: schedule.timezone,
    }).format(value);
  const distance = (meters: number) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(meters / 1000)} km`;

  async function toggleActive() {
    if (
      schedule.active &&
      !(await confirm(m.archiveHint, {
        title: m.archiveSchedule,
        actionLabel: m.archiveSchedule,
      }))
    )
      return;
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        vehicleId: schedule.vehicleId,
        id: schedule._id,
        expectedRevision: schedule.revision,
        service: schedule.service,
        days: schedule.days,
        meters: schedule.meters,
        active: !schedule.active,
        requestKey,
      });
    } catch (cause) {
      setError(scheduleError(cause, m));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card
      className="settings-card operations-schedule-card"
      data-schedule-id={schedule._id}
    >
      <div className="operations-schedule-heading">
        <div>
          <h2>{schedule.service}</h2>
          <p>
            {[
              schedule.days !== undefined
                ? m.everyDays.replace(
                    "{days}",
                    new Intl.NumberFormat(locale).format(schedule.days),
                  )
                : null,
              schedule.meters !== undefined
                ? m.everyDistance.replace(
                    "{distance}",
                    distance(schedule.meters),
                  )
                : null,
            ]
              .filter(Boolean)
              .join(` ${m.or} `)}
          </p>
        </div>
        <span
          className={`operations-badge ${!schedule.active ? "" : state === "upcoming" ? "is-valid" : state === "due" ? "is-expired" : "is-expiring"}`}
        >
          {schedule.active && <Icon className="size-4" aria-hidden />}
          {!schedule.active
            ? m.archived
            : state === "due"
              ? m.due
              : state === "upcoming"
                ? m.upcoming
                : m.unknownBaseline}
        </span>
      </div>
      <dl className="operations-schedule-thresholds">
        {schedule.days !== undefined && (
          <div>
            <dt>{m.nextServiceDate}</dt>
            <dd>
              {schedule.baselineValid && schedule.nextDueAt !== undefined
                ? formatted(schedule.nextDueAt)
                : "—"}
            </dd>
          </div>
        )}
        {schedule.meters !== undefined && (
          <div>
            <dt>{m.nextServiceMileage}</dt>
            <dd>
              {schedule.baselineValid && schedule.nextDueMeters !== undefined
                ? distance(schedule.nextDueMeters)
                : "—"}
            </dd>
          </div>
        )}
      </dl>
      {state === "unknown" && schedule.active && (
        <p className="operations-schedule-hint">{m.baselineHint}</p>
      )}
      {schedule.lastRecordId && (
        <Link
          href={`/app/${agencyId}/maintenance/${schedule.lastRecordId}`}
          className="workspace-backlink inline-flex min-h-11 items-center gap-2"
        >
          {m.lastService}
          {schedule.baselineAt !== undefined
            ? ` · ${formatted(schedule.baselineAt)}`
            : ""}
        </Link>
      )}
      {error && (
        <p className="operations-feedback" role="alert">
          {error}
        </p>
      )}
      {canManage && (
        <div className="operations-form-actions">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={pending || disabled}
            onClick={onEdit}
          >
            {m.editSchedule}
          </Button>
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={pending || disabled}
            onClick={() => void toggleActive()}
          >
            {pending
              ? m.saving
              : schedule.active
                ? m.archiveSchedule
                : m.restoreSchedule}
          </Button>
        </div>
      )}
    </Card>
  );
}

type ScheduleDraft = {
  revision: number;
  service: string;
  days: string;
  distance: string;
  unit: "km" | "mi";
  active: boolean;
};
function scheduleDraft(original: Schedule | null): ScheduleDraft {
  return {
    revision: original?.revision ?? 0,
    service: original?.service ?? "",
    days: original?.days?.toString() ?? "",
    distance:
      original?.meters === undefined ? "" : String(original.meters / 1000),
    unit: "km",
    active: original?.active ?? true,
  };
}

function ScheduleEditor({
  agencyId,
  vehicleId,
  original,
  onDirtyChange,
  onPendingChange,
  onSaved,
  onCancel,
}: {
  agencyId: Id<"agencies">;
  vehicleId: Id<"vehicles">;
  original: Schedule | null;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const confirm = useConfirm();
  const save = useMutation(api.maintenance.saveSchedule);
  const latest = useQuery(
    api.maintenance.getSchedule,
    original ? { agencyId, vehicleId, id: original._id } : "skip",
  );
  const [draft, setDraft] = useState(() => scheduleDraft(original));
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(scheduleDraft(original)),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const dirty = JSON.stringify(draft) !== baseline;
  useUnsavedChanges(dirty);
  const stale = Boolean(latest && latest.revision !== draft.revision);
  const requestKey = useOperationRequestKey(
    JSON.stringify({ id: original?._id, draft }),
  );
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  function update(patch: Partial<ScheduleDraft>) {
    setDraft((value) => ({ ...value, ...patch }));
    setError(null);
    setInvalid(false);
  }
  async function reload() {
    if (
      !latest ||
      (dirty &&
        !(await confirm(m.discardDraft, { actionLabel: m.discardChanges })))
    )
      return;
    const next = scheduleDraft(latest);
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setError(null);
    setInvalid(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let meters: number | undefined;
    const days = draft.days.trim() ? Number(draft.days) : undefined;
    try {
      meters = draft.distance.trim()
        ? distanceMeters(Number(draft.distance), draft.unit)
        : undefined;
      if (
        !draft.service.trim() ||
        (days === undefined && meters === undefined) ||
        (days !== undefined &&
          (!Number.isInteger(days) || days < 1 || days > 3650)) ||
        (meters !== undefined && meters < 1)
      )
        throw new Error();
    } catch {
      setInvalid(true);
      return;
    }
    if (stale) {
      setError(m.conflict);
      return;
    }
    setPending(true);
    setError(null);
    setInvalid(false);
    try {
      await save({
        agencyId,
        vehicleId,
        id: original?._id,
        expectedRevision: draft.revision,
        service: draft.service,
        days,
        meters,
        active: draft.active,
        requestKey,
      });
      onSaved();
    } catch (cause) {
      setError(scheduleError(cause, m));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="operations-form-card">
      <form
        className="operations-form operations-schedule-form"
        onSubmit={(event) => void submit(event)}
      >
        <div className="settings-card-heading">
          <h2>{original ? m.editSchedule : m.addSchedule}</h2>
          <p>{m.intervalHint}</p>
        </div>
        <fieldset className="operations-fields" disabled={pending}>
          <Field className="operations-field-wide">
            <Label htmlFor="schedule-service">{m.scheduleService}</Label>
            <Input
              id="schedule-service"
              autoFocus
              value={draft.service}
              maxLength={120}
              required
              onChange={(event) => update({ service: event.target.value })}
            />
          </Field>
          <Field>
            <Label htmlFor="schedule-days">{m.intervalDays}</Label>
            <Input
              id="schedule-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              step={1}
              value={draft.days}
              aria-invalid={invalid || undefined}
              aria-describedby="schedule-interval-hint"
              onChange={(event) => update({ days: event.target.value })}
            />
          </Field>
          <Field>
            <Label htmlFor="schedule-distance">{m.intervalDistance}</Label>
            <Input
              id="schedule-distance"
              type="number"
              inputMode="decimal"
              min={0.001}
              max={MAX_METERS / (draft.unit === "km" ? 1000 : 1609.344)}
              step="any"
              value={draft.distance}
              aria-invalid={invalid || undefined}
              aria-describedby="schedule-interval-hint"
              onChange={(event) => update({ distance: event.target.value })}
            />
          </Field>
          <Field>
            <Label htmlFor="schedule-unit">{m.unit}</Label>
            <Select
              value={draft.unit}
              dir={locale === "ar" ? "rtl" : "ltr"}
              onValueChange={(value) => update({ unit: value as "km" | "mi" })}
            >
              <SelectTrigger id="schedule-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="km">{m.kilometers}</SelectItem>
                <SelectItem value="mi">{m.miles}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p
            id="schedule-interval-hint"
            className="operations-schedule-hint operations-field-wide"
            role={invalid ? "alert" : undefined}
          >
            {invalid ? m.intervalInvalid : m.baselineHint}
          </p>
        </fieldset>
        {(stale || error) && (
          <p className="operations-feedback" role="alert">
            {error ?? m.conflict}
          </p>
        )}
        <div className="operations-form-actions">
          <Button disabled={pending || stale}>
            {pending ? m.saving : m.saveSchedule}
          </Button>
          {original && (
            <Button
              type="button"
              variant="outline"
              disabled={pending || !latest}
              onClick={() => void reload()}
            >
              {m.reload}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onCancel}
          >
            {m.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
