"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowUpRight,
  ClipboardCheck,
  Gauge,
  ListChecks,
  Plus,
  Settings2,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { operationsApi } from "@/lib/operations-api";
import { useOperationRequestKey } from "@/lib/use-operation-request-key";
import { localInstant, localOffsets } from "@/lib/operations";
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
import { WorkspaceLoading } from "@/components/workspace-loading";
import { useConfirm } from "@/components/confirmation-provider";
import { useUnsavedChanges } from "@/components/settings/form-fields";
import { CostLines, parseCostDraft, type CostDraft } from "./cost-lines";
import { OperationTime } from "./operation-time";
import { TaskEditor } from "./task-editor";

export type OperationsSection =
  "overview" | "maintenance" | "inspections" | "tasks";

const sections = [
  { key: "overview", icon: Gauge, path: "/operations" },
  { key: "maintenance", icon: Wrench, path: "/maintenance" },
  { key: "inspections", icon: ClipboardCheck, path: "/inspections" },
  { key: "tasks", icon: ListChecks, path: "/tasks" },
] as const;

function statusLabel(
  status: string,
  m: ReturnType<typeof useI18n>["messages"]["operations"],
) {
  const labels: Record<string, string> = {
    planned: m.planned,
    in_progress: m.inProgress,
    completed: m.completed,
    cancelled: m.cancelled,
    draft: m.draft,
    open: m.openTask,
    done: m.done,
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function dateTime(value: number | undefined, locale: string) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value)
    : "—";
}

function OperationFeedback({
  error,
  saved,
}: {
  error: string | null;
  saved: boolean;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  return error ? (
    <p className="operations-feedback" role="alert">
      {error}
    </p>
  ) : saved ? (
    <p className="operations-saved" role="status">
      {m.saved}
    </p>
  ) : null;
}

function operationError(cause: unknown, fallback: string, conflict: string) {
  const text = String(cause);
  return text.includes("CONFLICT") ? conflict : fallback;
}

export function OperationsPage({
  agencyId,
  section,
}: {
  agencyId: string;
  section: OperationsSection;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  const id = agencyId as Id<"agencies">;
  const workspace = useQuery(api.identity.getWorkspace, { agencyId: id });

  if (workspace === undefined)
    return (
      <section className="workspace-page operations-page">
        <WorkspaceLoading label={m.loading} variant="card" />
      </section>
    );

  const permissions = workspace?.permissions ?? [];
  const canReadAny =
    permissions.includes("maintenance.read") ||
    permissions.includes("inspection.read") ||
    permissions.includes("task.read");
  const sectionPermission = {
    overview: canReadAny,
    maintenance: permissions.includes("maintenance.read"),
    inspections: permissions.includes("inspection.read"),
    tasks: permissions.includes("task.read"),
  }[section];

  return (
    <section className="workspace-page operations-page">
      <Link
        href={`/app/${agencyId}`}
        className="workspace-backlink inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft className="directional-icon size-4" aria-hidden />
        {m.back}
      </Link>
      <header className="settings-heading operations-heading">
        <p className="eyebrow">{workspace?.agency.name ?? m.title}</p>
        <h1>{m.title}</h1>
        <p>{m.description}</p>
      </header>
      <nav className="operations-nav" aria-label={m.title}>
        {sections
          .filter(({ key }) => {
            if (key === "overview") return canReadAny;
            const permission =
              key === "maintenance"
                ? "maintenance.read"
                : key === "inspections"
                  ? "inspection.read"
                  : "task.read";
            return permissions.includes(permission);
          })
          .map(({ key, icon: Icon, path }) => (
            <Link
              key={key}
              href={`/app/${agencyId}${path}`}
              aria-current={section === key ? "page" : undefined}
            >
              <Icon className="size-4" aria-hidden />
              {m[key]}
            </Link>
          ))}
        {(permissions.includes("document.vehicle.read") ||
          permissions.includes("inspection.read")) && (
          <Link href={`/app/${agencyId}/settings/operations`}>
            <Settings2 className="size-4" aria-hidden />
            {m.settings}
          </Link>
        )}
      </nav>
      {!workspace || !sectionPermission ? (
        <Card className="settings-card">
          <p role="status">{m.denied}</p>
        </Card>
      ) : (
        <div key={`${agencyId}:${section}`}>
          {section === "overview" && (
            <OperationsOverview agencyId={id} permissions={permissions} />
          )}
          {section === "maintenance" && (
            <MaintenanceBoard
              agencyId={id}
              currency={workspace.agency.currency}
              timezone={workspace.agency.timezone}
              canManage={permissions.includes("maintenance.manage")}
            />
          )}
          {section === "inspections" && (
            <InspectionsBoard
              agencyId={id}
              timezone={workspace.agency.timezone}
              canManage={permissions.includes("inspection.manage")}
            />
          )}
          {section === "tasks" && (
            <TasksBoard
              agencyId={id}
              timezone={workspace.agency.timezone}
              canManage={permissions.includes("task.manage")}
              assignedOnly={workspace.membership.roleKey === "EMPLOYEE"}
              canAssign={
                permissions.includes("task.manage") &&
                workspace.membership.roleKey !== "EMPLOYEE"
              }
            />
          )}
        </div>
      )}
    </section>
  );
}

function OperationsOverview({
  agencyId,
  permissions,
}: {
  agencyId: Id<"agencies">;
  permissions: string[];
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  const cards = [
    {
      permission: "maintenance.read",
      icon: Wrench,
      title: m.maintenance,
      detail: m.createMaintenance,
      href: `/app/${agencyId}/maintenance`,
    },
    {
      permission: "inspection.read",
      icon: ClipboardCheck,
      title: m.inspections,
      detail: m.createInspection,
      href: `/app/${agencyId}/inspections`,
    },
    {
      permission: "task.read",
      icon: ListChecks,
      title: m.tasks,
      detail: m.agencyQueue,
      href: `/app/${agencyId}/tasks`,
    },
  ];
  return (
    <div className="operations-overview">
      {cards
        .filter((card) => permissions.includes(card.permission))
        .map(({ icon: Icon, ...card }) => (
          <Card className="operations-entry" key={card.href}>
            <div className="operations-entry-icon">
              <Icon className="size-5" aria-hidden />
            </div>
            <div>
              <h2>{card.title}</h2>
              <p>{card.detail}</p>
            </div>
            <Button variant="outline" size="icon" asChild>
              <Link href={card.href} aria-label={`${m.open}: ${card.title}`}>
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </Card>
        ))}
    </div>
  );
}

function MaintenanceBoard({
  agencyId,
  currency,
  timezone,
  canManage,
}: {
  agencyId: Id<"agencies">;
  currency: string;
  timezone: string;
  canManage: boolean;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const router = useRouter();
  const [status, setStatus] =
    useState<Doc<"maintenanceRecords">["status"]>("planned");
  const {
    results,
    loadMore,
    status: pageStatus,
  } = usePaginatedQuery(
    operationsApi.maintenance.list,
    { agencyId, status },
    { initialNumItems: 20 },
  );
  const vehicles = useQuery(operationsApi.catalogs.vehicles, { agencyId });
  const vendors = useQuery(operationsApi.catalogs.vendors, { agencyId });
  const [showForm, setShowForm] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [costLines, setCostLines] = useState<CostDraft[]>([]);
  const confirm = useConfirm();
  const [vehicleId, setVehicleId] = useState("");
  const [scheduleIds, setScheduleIds] = useState<Id<"maintenanceSchedules">[]>(
    [],
  );
  const schedules = useQuery(
    operationsApi.maintenance.schedules,
    vehicleId
      ? { agencyId, vehicleId: vehicleId as Id<"vehicles">, active: true }
      : "skip",
  );
  const [vendorId, setVendorId] = useState("");
  const [title, setTitle] = useState("");
  const [findings, setFindings] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const startOffsets = localOffsets(start, timezone);
  const endOffsets = localOffsets(end, timezone);
  const [startOffset, setStartOffset] = useState("");
  const [endOffset, setEndOffset] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(operationsApi.maintenance.save);
  const reportEmergency = useMutation(api.maintenance.reportEmergency);
  const dirty = Boolean(
    vehicleId ||
    vendorId ||
    title ||
    findings ||
    start ||
    end ||
    costLines.length ||
    scheduleIds.length,
  );
  useUnsavedChanges(showForm && dirty && !saved);
  async function toggleForm() {
    if (
      showForm &&
      dirty &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setShowForm(!showForm);
    if (showForm) {
      setVehicleId("");
      setVendorId("");
      setTitle("");
      setFindings("");
      setStart("");
      setEnd("");
      setStartOffset("");
      setEndOffset("");
      setScheduleIds([]);
      setCostLines([]);
      setEmergency(false);
      setError(null);
    }
  }
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      vehicleId,
      vendorId,
      title,
      findings,
      start,
      end,
      startOffset,
      endOffset,
      scheduleIds,
      emergency,
      costLines,
    }),
  );
  const vehicleLabels = useMemo(
    () => new Map(vehicles?.map((vehicle) => [vehicle.id, vehicle.label])),
    [vehicles],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !vehicleId ||
      !title.trim() ||
      (!emergency && Boolean(start) !== Boolean(end))
    ) {
      setError(m.invalid);
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const shared = {
        agencyId,
        vehicleId: vehicleId as Id<"vehicles">,
        vendorId: vendorId ? (vendorId as Id<"maintenanceVendors">) : undefined,
        title,
        findings,
        scheduleIds,
        expectedCurrency: currency,
        requestKey,
      };
      const recordId = emergency
        ? await reportEmergency(shared)
        : await save({
            ...shared,
            expectedRevision: 0,
            startAt: start
              ? localInstant(start, timezone, startOffset || undefined)
              : undefined,
            endAt: end
              ? localInstant(end, timezone, endOffset || undefined)
              : undefined,
            costLines: parseCostDraft(costLines, currency),
          });
      setSaved(true);
      router.push(`/app/${agencyId}/maintenance/${recordId}`);
    } catch (cause) {
      setError(operationError(cause, m.failed, m.conflict));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="operations-stack">
      <div className="operations-toolbar">
        <div
          className="operations-segment"
          role="group"
          aria-label={m.maintenance}
        >
          {(["planned", "in_progress", "completed", "cancelled"] as const).map(
            (value) => (
              <Button
                key={value}
                type="button"
                variant={status === value ? "secondary" : "ghost"}
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
              >
                {statusLabel(value, m)}
              </Button>
            ),
          )}
        </div>
        <Button variant="outline" className="rounded-full min-h-11" asChild>
          <Link href={`/app/${agencyId}/maintenance/schedules`}>
            {m.schedules}
          </Link>
        </Button>
        {canManage && (
          <Button
            className="rounded-full min-h-11"
            disabled={pending}
            onClick={() => void toggleForm()}
          >
            <Plus className="size-4" aria-hidden />
            {m.createMaintenance}
          </Button>
        )}
      </div>
      {showForm && (
        <Card className="operations-form-card">
          <form
            className="operations-form"
            onSubmit={(event) => void submit(event)}
          >
            <div className="settings-card-heading">
              <h2>{emergency ? m.emergency : m.createMaintenance}</h2>
              <p>{m.timezoneHint.replace("{timezone}", timezone)}</p>
            </div>
            <fieldset disabled={pending} className="operations-form">
              <Label className="operations-check">
                <Checkbox
                  checked={emergency}
                  onCheckedChange={(value) => setEmergency(value === true)}
                />
                {m.emergency}
              </Label>
              {emergency && (
                <p className="operations-helper">{m.emergencyHint}</p>
              )}
              <div className="operations-fields">
                <Field>
                  <Label htmlFor="maintenance-vehicle">{m.vehicle}</Label>
                  <Select
                    value={vehicleId}
                    onValueChange={(value) => {
                      setVehicleId(value);
                      setScheduleIds([]);
                    }}
                    dir={locale === "ar" ? "rtl" : "ltr"}
                  >
                    <SelectTrigger id="maintenance-vehicle" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles
                        ?.filter((vehicle) => vehicle.active)
                        .map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor="maintenance-vendor">{m.vendor}</Label>
                  <Select
                    value={vendorId || "none"}
                    onValueChange={(value) =>
                      setVendorId(value === "none" ? "" : value)
                    }
                    dir={locale === "ar" ? "rtl" : "ltr"}
                  >
                    <SelectTrigger id="maintenance-vendor" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{m.noVendor}</SelectItem>
                      {vendors
                        ?.filter((vendor) => vendor.active)
                        .map((vendor) => (
                          <SelectItem key={vendor._id} value={vendor._id}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="operations-field-wide">
                  <Label htmlFor="maintenance-title">{m.titleField}</Label>
                  <Input
                    id="maintenance-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={160}
                    required
                  />
                </Field>
                {vehicleId && (
                  <fieldset className="operations-field-wide operations-linked-schedules">
                    <legend>{m.linkedSchedules}</legend>
                    <p>{m.linkedSchedulesHint}</p>
                    {schedules === undefined ? (
                      <p role="status">{m.loading}</p>
                    ) : schedules.length === 0 ? (
                      <p>{m.noActiveSchedules}</p>
                    ) : (
                      schedules.map((schedule) => (
                        <Label className="operations-check" key={schedule._id}>
                          <Checkbox
                            checked={scheduleIds.includes(schedule._id)}
                            onCheckedChange={(checked) =>
                              setScheduleIds((current) =>
                                checked === true
                                  ? [...current, schedule._id]
                                  : current.filter((id) => id !== schedule._id),
                              )
                            }
                          />
                          {schedule.service}
                        </Label>
                      ))
                    )}
                    <Link
                      href={`/app/${agencyId}/maintenance/schedules?vehicleId=${vehicleId}`}
                      className="workspace-backlink inline-flex min-h-11 items-center"
                    >
                      {m.schedules}
                    </Link>
                  </fieldset>
                )}
                {!emergency && (
                  <Field>
                    <Label htmlFor="maintenance-start">{m.plannedStart}</Label>
                    <Input
                      id="maintenance-start"
                      type="datetime-local"
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                    />
                  </Field>
                )}
                {!emergency && startOffsets.length > 1 && (
                  <Field>
                    <Label htmlFor="maintenance-start-offset">{m.offset}</Label>
                    <Select value={startOffset} onValueChange={setStartOffset}>
                      <SelectTrigger
                        id="maintenance-start-offset"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {startOffsets.map((offset) => (
                          <SelectItem key={offset} value={offset}>
                            {offset}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {!emergency && (
                  <Field>
                    <Label htmlFor="maintenance-end">{m.plannedEnd}</Label>
                    <Input
                      id="maintenance-end"
                      type="datetime-local"
                      value={end}
                      onChange={(event) => setEnd(event.target.value)}
                    />
                  </Field>
                )}
                {!emergency && endOffsets.length > 1 && (
                  <Field>
                    <Label htmlFor="maintenance-end-offset">{m.offset}</Label>
                    <Select value={endOffset} onValueChange={setEndOffset}>
                      <SelectTrigger
                        id="maintenance-end-offset"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {endOffsets.map((offset) => (
                          <SelectItem key={offset} value={offset}>
                            {offset}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <Field className="operations-field-wide">
                  <Label htmlFor="maintenance-findings">{m.findings}</Label>
                  <Textarea
                    id="maintenance-findings"
                    value={findings}
                    onChange={(event) => setFindings(event.target.value)}
                    maxLength={4000}
                  />
                </Field>
              </div>
              {!emergency && (
                <CostLines
                  prefix="maintenance-plan"
                  value={costLines}
                  onChange={setCostLines}
                  currency={currency}
                  disabled={pending}
                />
              )}
            </fieldset>
            <OperationFeedback error={error} saved={saved} />
            <div className="operations-form-actions">
              <Button
                disabled={
                  pending || (Boolean(vehicleId) && schedules === undefined)
                }
              >
                {m.createMaintenance}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => void toggleForm()}
              >
                {m.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <OperationsQueue
        loading={pageStatus === "LoadingFirstPage"}
        empty={results.length === 0}
        rows={results.map((record) => ({
          id: record._id,
          title: record.title,
          vehicle: vehicleLabels.get(record.vehicleId) ?? "—",
          status: statusLabel(record.status, m),
          meta: dateTime(record.startAt ?? record.recordedAt, locale),
          href: `/app/${agencyId}/maintenance/${record._id}`,
          urgent: record.emergency,
        }))}
        canLoadMore={
          pageStatus === "CanLoadMore" || pageStatus === "LoadingMore"
        }
        loadingMore={pageStatus === "LoadingMore"}
        onLoadMore={() => loadMore(20)}
      />
    </div>
  );
}

function InspectionsBoard({
  agencyId,
  timezone,
  canManage,
}: {
  agencyId: Id<"agencies">;
  timezone: string;
  canManage: boolean;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const router = useRouter();
  const [status, setStatus] =
    useState<Doc<"vehicleInspections">["status"]>("draft");
  const {
    results,
    loadMore,
    status: pageStatus,
  } = usePaginatedQuery(
    operationsApi.inspections.queue,
    { agencyId, status },
    { initialNumItems: 20 },
  );
  const vehicles = useQuery(operationsApi.catalogs.vehicles, { agencyId });
  const templates = useQuery(operationsApi.catalogs.templates, { agencyId });
  const [showForm, setShowForm] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [type, setType] =
    useState<Doc<"vehicleInspections">["type"]>("routine");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [startOffset, setStartOffset] = useState("");
  const [endOffset, setEndOffset] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  useUnsavedChanges(
    showForm && Boolean(vehicleId || templateId || start || end),
  );
  async function toggleForm() {
    if (
      showForm &&
      (vehicleId || templateId || start || end) &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setShowForm(!showForm);
    if (showForm) {
      setStart("");
      setEnd("");
      setStartOffset("");
      setEndOffset("");
      setVehicleId("");
      setTemplateId("");
      setError(null);
    }
  }
  const create = useMutation(operationsApi.inspections.create);
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      vehicleId,
      templateId,
      type,
      start,
      end,
      startOffset,
      endOffset,
    }),
  );
  const vehicleLabels = useMemo(
    () => new Map(vehicles?.map((vehicle) => [vehicle.id, vehicle.label])),
    [vehicles],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vehicleId || !templateId || Boolean(start) !== Boolean(end))
      return setError(m.invalid);
    setPending(true);
    setError(null);
    try {
      const id = await create({
        agencyId,
        vehicleId: vehicleId as Id<"vehicles">,
        templateId: templateId as Id<"inspectionTemplates">,
        type,
        startAt: start
          ? localInstant(start, timezone, startOffset || undefined)
          : undefined,
        endAt: end
          ? localInstant(end, timezone, endOffset || undefined)
          : undefined,
        requestKey,
      });
      router.push(`/app/${agencyId}/inspections/${id}`);
    } catch (cause) {
      setError(operationError(cause, m.failed, m.conflict));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="operations-stack">
      <div className="operations-toolbar">
        <div
          className="operations-segment"
          role="group"
          aria-label={m.inspections}
        >
          {(["draft", "completed", "cancelled"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant={status === value ? "secondary" : "ghost"}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {statusLabel(value, m)}
            </Button>
          ))}
        </div>
        {canManage && (
          <Button
            className="rounded-full min-h-11"
            disabled={pending}
            onClick={() => void toggleForm()}
          >
            <Plus className="size-4" aria-hidden />
            {m.createInspection}
          </Button>
        )}
      </div>
      {showForm && (
        <Card className="operations-form-card">
          <form
            className="operations-form"
            onSubmit={(event) => void submit(event)}
          >
            <div className="settings-card-heading">
              <h2>{m.createInspection}</h2>
              <p>{m.timezoneHint.replace("{timezone}", timezone)}</p>
            </div>
            <fieldset disabled={pending} className="operations-fields">
              <Field>
                <Label htmlFor="inspection-vehicle">{m.vehicle}</Label>
                <Select
                  value={vehicleId}
                  onValueChange={setVehicleId}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                >
                  <SelectTrigger id="inspection-vehicle" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles
                      ?.filter((vehicle) => vehicle.active)
                      .map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <Label htmlFor="inspection-template">{m.template}</Label>
                <Select
                  value={templateId}
                  onValueChange={setTemplateId}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                >
                  <SelectTrigger id="inspection-template" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((template) => (
                      <SelectItem key={template._id} value={template._id}>
                        {template.name[locale]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <Label htmlFor="inspection-type">{m.inspectionType}</Label>
                <Select
                  value={type}
                  onValueChange={(value) => setType(value as typeof type)}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                >
                  <SelectTrigger id="inspection-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="initial">{m.initial}</SelectItem>
                    <SelectItem value="routine">{m.routine}</SelectItem>
                    <SelectItem value="post_repair">{m.postRepair}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <OperationTime
                prefix="inspection-start"
                label={m.plannedStart}
                value={start}
                onChange={setStart}
                offset={startOffset}
                setOffset={setStartOffset}
                timezone={timezone}
              />
              <OperationTime
                prefix="inspection-end"
                label={m.plannedEnd}
                value={end}
                onChange={setEnd}
                offset={endOffset}
                setOffset={setEndOffset}
                timezone={timezone}
              />
            </fieldset>
            <OperationFeedback error={error} saved={false} />
            <div className="operations-form-actions">
              <Button disabled={pending}>{m.createInspection}</Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => void toggleForm()}
              >
                {m.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <OperationsQueue
        loading={pageStatus === "LoadingFirstPage"}
        empty={results.length === 0}
        rows={results.map((record) => ({
          id: record._id,
          title: record.templateName[locale],
          vehicle: vehicleLabels.get(record.vehicleId) ?? "—",
          status: statusLabel(record.status, m),
          meta: dateTime(record.completedAt ?? record.recordedAt, locale),
          href: `/app/${agencyId}/inspections/${record._id}`,
        }))}
        canLoadMore={
          pageStatus === "CanLoadMore" || pageStatus === "LoadingMore"
        }
        loadingMore={pageStatus === "LoadingMore"}
        onLoadMore={() => loadMore(20)}
      />
    </div>
  );
}

function TasksBoard({
  agencyId,
  timezone,
  canAssign,
  canManage,
  assignedOnly,
}: {
  agencyId: Id<"agencies">;
  timezone: string;
  canAssign: boolean;
  canManage: boolean;
  assignedOnly: boolean;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const [status, setStatus] =
    useState<Doc<"operationalTasks">["status"]>("open");
  const [mine, setMine] = useState(assignedOnly);
  const {
    results,
    loadMore,
    status: pageStatus,
  } = usePaginatedQuery(
    api.tasks.list,
    { agencyId, status, mine },
    { initialNumItems: 20 },
  );
  const vehicles = useQuery(operationsApi.catalogs.vehicles, { agencyId });
  const assignees = useQuery(
    api.tasks.assignees,
    canAssign ? { agencyId } : "skip",
  );
  const save = useMutation(api.tasks.save);
  const [editing, setEditing] = useState<Doc<"operationalTasks"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] =
    useState<Doc<"operationalTasks">["priority"]>("normal");
  const [due, setDue] = useState("");
  const dueOffsets = localOffsets(due, timezone);
  const [dueOffset, setDueOffset] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vehicleLabels = useMemo(
    () => new Map(vehicles?.map((vehicle) => [vehicle.id, vehicle.label])),
    [vehicles],
  );
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      title,
      description,
      vehicleId,
      assigneeId,
      priority,
      due,
      dueOffset,
    }),
  );

  useUnsavedChanges(
    showForm &&
      !saved &&
      Boolean(title || description || vehicleId || assigneeId || due),
  );
  async function toggleForm() {
    if (
      showForm &&
      (title || description || vehicleId || assigneeId || due) &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setShowForm(!showForm);
    setSaved(false);
    if (showForm) {
      setTitle("");
      setDescription("");
      setVehicleId("");
      setAssigneeId("");
      setDue("");
      setDueOffset("");
      setError(null);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return setError(m.invalid);
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await save({
        agencyId,
        expectedRevision: 0,
        vehicleId: vehicleId ? (vehicleId as Id<"vehicles">) : undefined,
        title,
        description,
        assigneeId: assigneeId ? (assigneeId as Id<"users">) : undefined,
        dueAt: due
          ? localInstant(due, timezone, dueOffset || undefined)
          : undefined,
        status: "open",
        priority,
        requestKey,
      });
      setTitle("");
      setDescription("");
      setSaved(true);
      setShowForm(false);
    } catch (cause) {
      setError(operationError(cause, m.failed, m.conflict));
    } finally {
      setPending(false);
    }
  }

  async function advance(task: Doc<"operationalTasks">) {
    const nextStatus = task.status === "open" ? "in_progress" : "done";
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        id: task._id,
        expectedRevision: task.revision,
        vehicleId: task.vehicleId,
        title: task.title,
        description: task.description,
        assigneeId: task.assigneeId,
        dueAt: task.dueAt,
        status: nextStatus,
        priority: task.priority,
        requestKey: `task-${task._id}-${task.revision}-${nextStatus}`,
      });
    } catch (cause) {
      setError(operationError(cause, m.failed, m.conflict));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="operations-stack">
      <div className="operations-toolbar">
        <div className="operations-segment" role="group" aria-label={m.tasks}>
          {(["open", "in_progress", "done", "cancelled"] as const).map(
            (value) => (
              <Button
                key={value}
                type="button"
                variant={status === value ? "secondary" : "ghost"}
                aria-pressed={status === value}
                disabled={Boolean(editing) || pending}
                onClick={() => setStatus(value)}
              >
                {statusLabel(value, m)}
              </Button>
            ),
          )}
        </div>
        <div className="operations-actions">
          {!assignedOnly ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setMine(!mine)}
              disabled={Boolean(editing) || pending}
              aria-pressed={mine}
            >
              {mine ? m.myTasks : m.agencyQueue}
            </Button>
          ) : (
            <span className="operations-badge">{m.myTasks}</span>
          )}
          {canAssign && (
            <Button
              className="rounded-full min-h-11"
              onClick={() => void toggleForm()}
              disabled={Boolean(editing) || pending}
            >
              <Plus className="size-4" aria-hidden />
              {m.createTask}
            </Button>
          )}
        </div>
      </div>
      {canManage && editing && (
        <TaskEditor
          key={editing._id}
          agencyId={agencyId}
          task={editing}
          current={results.find((row) => row._id === editing._id)}
          canAssign={canAssign}
          onClose={() => {
            const id = editing._id;
            setEditing(null);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(
                  `[data-operation-id="${id}"] [data-edit-task]`,
                )
                ?.focus(),
            );
          }}
        />
      )}
      {showForm && (
        <Card className="operations-form-card">
          <form
            className="operations-form"
            onSubmit={(event) => void submit(event)}
          >
            <div className="settings-card-heading">
              <h2>{m.createTask}</h2>
            </div>
            <fieldset disabled={pending} className="operations-fields">
              <Field className="operations-field-wide">
                <Label htmlFor="task-title">{m.titleField}</Label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="task-vehicle">{m.vehicle}</Label>
                <Select
                  value={vehicleId || "none"}
                  onValueChange={(value) =>
                    setVehicleId(value === "none" ? "" : value)
                  }
                  dir={locale === "ar" ? "rtl" : "ltr"}
                >
                  <SelectTrigger id="task-vehicle" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{m.all}</SelectItem>
                    {vehicles?.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <Label htmlFor="task-assignee">{m.assignee}</Label>
                <Select
                  value={assigneeId || "none"}
                  onValueChange={(value) =>
                    setAssigneeId(value === "none" ? "" : value)
                  }
                  dir={locale === "ar" ? "rtl" : "ltr"}
                >
                  <SelectTrigger id="task-assignee" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{m.unassigned}</SelectItem>
                    {assignees?.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <Label htmlFor="task-priority">{m.priority}</Label>
                <Select
                  value={priority}
                  onValueChange={(value) =>
                    setPriority(value as typeof priority)
                  }
                  dir={locale === "ar" ? "rtl" : "ltr"}
                >
                  <SelectTrigger id="task-priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">{m.normal}</SelectItem>
                    <SelectItem value="high">{m.high}</SelectItem>
                    <SelectItem value="urgent">{m.urgent}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <Label htmlFor="task-due">{m.due}</Label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={due}
                  onChange={(event) => setDue(event.target.value)}
                />
              </Field>
              {dueOffsets.length > 1 && (
                <Field>
                  <Label htmlFor="task-due-offset">{m.offset}</Label>
                  <Select value={dueOffset} onValueChange={setDueOffset}>
                    <SelectTrigger id="task-due-offset" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dueOffsets.map((offset) => (
                        <SelectItem key={offset} value={offset}>
                          {offset}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field className="operations-field-wide">
                <Label htmlFor="task-description">{m.descriptionField}</Label>
                <Textarea
                  id="task-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={2000}
                />
              </Field>
            </fieldset>
            <OperationFeedback error={error} saved={saved} />
            <div className="operations-form-actions">
              <Button disabled={pending}>{m.createTask}</Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => void toggleForm()}
              >
                {m.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <OperationsQueue
        loading={pageStatus === "LoadingFirstPage"}
        empty={results.length === 0}
        rows={results.map((task) => ({
          id: task._id,
          title: task.title,
          vehicle: task.vehicleId
            ? (vehicleLabels.get(task.vehicleId) ?? "—")
            : m.all,
          status: statusLabel(task.status, m),
          meta: task.dueAt
            ? `${m.due}: ${dateTime(task.dueAt, locale)}`
            : task.priority === "urgent"
              ? m.urgent
              : m[task.priority],
          urgent: task.priority === "urgent",
          action:
            canManage &&
            (task.status === "open" || task.status === "in_progress")
              ? {
                  label: task.status === "open" ? m.start : m.complete,
                  disabled: pending || Boolean(editing),
                  run: () => void advance(task),
                }
              : undefined,
          extra: canManage && (
            <Button
              data-edit-task
              variant="ghost"
              disabled={pending || showForm || Boolean(editing)}
              onClick={() => setEditing(task)}
            >
              {m.editCatalog}
            </Button>
          ),
        }))}
        canLoadMore={
          pageStatus === "CanLoadMore" || pageStatus === "LoadingMore"
        }
        loadingMore={pageStatus === "LoadingMore"}
        onLoadMore={() => loadMore(20)}
      />
    </div>
  );
}

function OperationsQueue({
  loading,
  empty,
  rows,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  loading: boolean;
  empty: boolean;
  rows: Array<{
    id: string;
    title: string;
    vehicle: string;
    status: string;
    meta: string;
    href?: string;
    urgent?: boolean;
    action?: { label: string; disabled: boolean; run: () => void };
    extra?: React.ReactNode;
  }>;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  if (loading) return <WorkspaceLoading label={m.loading} variant="card" />;
  if (empty)
    return (
      <div className="operations-empty">
        <ListChecks className="size-8 text-primary" aria-hidden />
        <p>{m.empty}</p>
      </div>
    );
  return (
    <>
      <div className="operations-queue">
        {rows.map((row) => (
          <Card
            className="operations-row"
            key={row.id}
            data-operation-id={row.id}
          >
            <span
              className={`operations-status-dot${row.urgent ? " is-urgent" : ""}`}
              aria-hidden
            />
            <div className="operations-row-main">
              <p className="operations-row-kicker">{row.vehicle}</p>
              <h2>{row.title}</h2>
              <p>{row.meta}</p>
            </div>
            <span className="operations-badge">{row.status}</span>
            {row.href && (
              <Button asChild size="icon" variant="ghost">
                <Link
                  href={row.href}
                  aria-label={`${m.viewRecord}: ${row.title}`}
                >
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </Button>
            )}
            {row.action && (
              <Button
                type="button"
                variant="outline"
                disabled={row.action.disabled}
                onClick={row.action.run}
              >
                {row.action.label}
              </Button>
            )}
            {row.extra}
          </Card>
        ))}
      </div>
      {canLoadMore && (
        <Button
          className="self-start"
          variant="outline"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {m.loadMore}
        </Button>
      )}
    </>
  );
}
