"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, CheckCircle2, Play, XCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useConfirm } from "@/components/confirmation-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/client";
import { operationsApi } from "@/lib/operations-api";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { api } from "../../../convex/_generated/api";
import { PrivateEvidence } from "./private-evidence";
import { useOperationRequestKey } from "@/lib/use-operation-request-key";
import { useUnsavedChanges } from "@/components/settings/form-fields";
import {
  CostLines,
  costDraft,
  parseCostDraft,
  type CostDraft,
} from "./cost-lines";
import { MaintenanceCostCorrection } from "./maintenance-cost-correction";
import { MaintenancePlanEditor } from "./maintenance-plan-editor";

export function MaintenanceDetail({
  agencyId,
  recordId,
}: {
  agencyId: string;
  recordId: string;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const aid = agencyId as Id<"agencies">;
  const id = recordId as Id<"maintenanceRecords">;
  const record = useQuery(operationsApi.maintenance.get, { agencyId: aid, id });
  const workspace = useQuery(api.identity.getWorkspace, { agencyId: aid });
  const vendors = useQuery(
    operationsApi.catalogs.vendors,
    workspace?.permissions.includes("maintenance.read")
      ? { agencyId: aid }
      : "skip",
  );
  const start = useMutation(operationsApi.maintenance.start);
  const complete = useMutation(operationsApi.maintenance.complete);
  const cancel = useMutation(operationsApi.maintenance.cancel);
  const confirm = useConfirm();
  const [findings, setFindings] = useState("");
  const [mileage, setMileage] = useState("");
  const [readiness, setReadiness] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costLines, setCostLines] = useState<CostDraft[] | null>(null);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const mileageTime = useRef<{ key: string; at: number } | null>(null);
  const finishKey = useOperationRequestKey(
    JSON.stringify({
      id,
      revision: draftRevision ?? record?.record.revision,
      findings,
      mileage,
      readiness,
      costLines: costLines ?? record?.record.costLines,
    }),
  );
  const startKey = useOperationRequestKey(
    JSON.stringify({ id, revision: record?.record.revision, action: "start" }),
  );
  const cancelKey = useOperationRequestKey(
    JSON.stringify({
      id,
      revision: draftRevision ?? record?.record.revision,
      action: "cancel",
      findings,
      readiness,
    }),
  );
  useUnsavedChanges(
    (record?.record.status === "in_progress" ||
      record?.record.status === "planned") &&
      draftRevision !== null,
  );

  if (record === undefined || workspace === undefined)
    return (
      <section className="workspace-page operations-page">
        <WorkspaceLoading label={m.loading} variant="card" />
      </section>
    );
  if (!record || !workspace)
    return (
      <section className="workspace-page operations-page">
        <p role="status">{m.denied}</p>
      </section>
    );
  const r = record.record;
  const canManage = workspace.permissions.includes("maintenance.manage");
  const costs = costLines ?? costDraft(r.costLines ?? [], r.currency);
  const stale = draftRevision !== null && draftRevision !== r.revision;
  function changed() {
    setDraftRevision((value) => value ?? r.revision);
    setError(null);
  }
  async function reloadDraft() {
    if (!(await confirm(m.discardDraft, { actionLabel: m.discardChanges })))
      return;
    setDraftRevision(null);
    setCostLines(null);
    setFindings("");
    setMileage("");
    setReadiness(false);
    setError(null);
  }
  const formatted = (value: number | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(value)
      : "—";

  async function begin() {
    setPending(true);
    setError(null);
    try {
      await start({
        agencyId: aid,
        id,
        expectedRevision: r.revision,
        requestKey: startKey,
      });
      setDraftRevision(null);
      setFindings("");
      setReadiness(false);
      setError(null);
    } catch {
      setError(m.failed);
    } finally {
      setPending(false);
    }
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reading = mileage.trim() ? Number(mileage) : undefined;
    if (reading !== undefined && (!Number.isFinite(reading) || reading < 0))
      return setError(m.invalid);
    setPending(true);
    setError(null);
    try {
      const parsedCosts = parseCostDraft(costs, r.currency);
      if (mileageTime.current?.key !== finishKey)
        mileageTime.current = { key: finishKey, at: Date.now() };
      await complete({
        agencyId: aid,
        id,
        expectedRevision: draftRevision ?? r.revision,
        findings,
        mileage:
          reading === undefined
            ? undefined
            : {
                value: reading,
                unit: "km",
                observedAt: mileageTime.current.at,
              },
        costLines: parsedCosts,
        expectedCurrency: r.currency,
        readinessConfirmed: readiness,
        requestKey: finishKey,
      });
    } catch (cause) {
      setError(
        String(cause).includes("CONFLICT")
          ? m.conflict
          : String(cause).includes("OPERATIONS_INVALID")
            ? m.invalid
            : m.failed,
      );
    } finally {
      setPending(false);
    }
  }

  async function cancelWork() {
    if (!findings.trim()) return setError(m.invalid);
    const accepted = await confirm(m.cancel, {
      title: m.cancel,
      actionLabel: m.cancel,
      destructive: true,
    });
    if (!accepted) return;
    setPending(true);
    setError(null);
    try {
      await cancel({
        agencyId: aid,
        id,
        expectedRevision: draftRevision ?? r.revision,
        reason: findings,
        readinessConfirmed: readiness,
        requestKey: cancelKey,
      });
    } catch {
      setError(m.failed);
    } finally {
      setPending(false);
    }
  }

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
        <p className="eyebrow">{m.maintenance}</p>
        <h1>{r.title}</h1>
        <p>
          {m[r.status === "in_progress" ? "inProgress" : r.status]} ·{" "}
          {formatted(r.startAt ?? r.actualStartAt ?? r.recordedAt)}
        </p>
      </header>
      <div className="operations-detail-grid">
        <Card className="operations-history-card">
          <h2>{m.findings}</h2>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {r.findings || "—"}
          </p>
          <dl className="operations-definition-list">
            <div>
              <dt>{m.vendor}</dt>
              <dd>
                {vendors?.find((vendor) => vendor._id === r.vendorId)?.name ??
                  m.noVendor}
              </dd>
            </div>
            <div>
              <dt>{m.plannedStart}</dt>
              <dd>{formatted(r.startAt)}</dd>
            </div>
            <div>
              <dt>{m.plannedEnd}</dt>
              <dd>{formatted(r.endAt)}</dd>
            </div>
            <div>
              <dt>{m.completed}</dt>
              <dd>{formatted(r.completedAt)}</dd>
            </div>
          </dl>
        </Card>
        {record.expenses && (
          <Card className="operations-history-card">
            <h2>{m.private}</h2>
            {record.expenses.length === 0 ? (
              <p>—</p>
            ) : (
              record.expenses.map((expense) => (
                <div className="operations-expense" key={expense._id}>
                  <span>{expense.description}</span>
                  <strong>
                    {new Intl.NumberFormat(locale, {
                      style: "currency",
                      currency: expense.currency,
                    }).format(
                      expense.amountMinor /
                        (expense.currency === "TND" ? 1000 : 100),
                    )}
                  </strong>
                </div>
              ))
            )}
          </Card>
        )}
      </div>
      {canManage &&
        r.status === "planned" &&
        (showPlanEditor ? (
          <MaintenancePlanEditor
            agencyId={aid}
            record={r}
            timezone={workspace.agency.timezone}
            onClose={() => {
              setShowPlanEditor(false);
              requestAnimationFrame(() =>
                document.getElementById("maintenance-edit-open")?.focus(),
              );
            }}
          />
        ) : (
          <Card className="operations-form-card">
            <Field>
              <Label htmlFor="maintenance-cancel-reason">
                {m.cancellationReason}
              </Label>
              <Textarea
                id="maintenance-cancel-reason"
                value={findings}
                onChange={(event) => {
                  changed();
                  setFindings(event.target.value);
                }}
                disabled={pending}
                maxLength={500}
              />
            </Field>
            <Label className="operations-check">
              <Checkbox
                checked={readiness}
                disabled={pending}
                onCheckedChange={(value) => {
                  changed();
                  setReadiness(value === true);
                }}
              />
              {m.ready}
            </Label>
            {stale && (
              <p role="alert" className="operations-feedback">
                {m.conflict}
              </p>
            )}
            <div className="operations-actions">
              <Button
                id="maintenance-edit-open"
                disabled={pending || draftRevision !== null}
                variant="outline"
                onClick={() => setShowPlanEditor(true)}
              >
                {m.editCatalog}
              </Button>
              <Button disabled={pending || stale} onClick={() => void begin()}>
                <Play className="size-4" aria-hidden />
                {m.start}
              </Button>
              <Button
                disabled={pending || stale || !findings.trim()}
                variant="outline"
                onClick={() => void cancelWork()}
              >
                <XCircle className="size-4" aria-hidden />
                {m.cancel}
              </Button>
              {stale && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => void reloadDraft()}
                >
                  {m.reload}
                </Button>
              )}
            </div>
          </Card>
        ))}
      {canManage && r.status === "in_progress" && (
        <Card className="operations-form-card">
          <form
            className="operations-form"
            onSubmit={(event) => void finish(event)}
          >
            <div className="settings-card-heading">
              <h2>{m.complete}</h2>
            </div>
            <fieldset disabled={pending} className="operations-form">
              <div className="operations-fields">
                <Field className="operations-field-wide">
                  <Label htmlFor="maintenance-complete-findings">
                    {m.findings}
                  </Label>
                  <Textarea
                    id="maintenance-complete-findings"
                    value={findings}
                    onChange={(event) => {
                      changed();
                      setFindings(event.target.value);
                    }}
                    maxLength={4000}
                    required
                  />
                </Field>
                <Field>
                  <Label htmlFor="maintenance-mileage">
                    {m.latestMileage} (km)
                  </Label>
                  <Input
                    id="maintenance-mileage"
                    inputMode="decimal"
                    value={mileage}
                    onChange={(event) => {
                      changed();
                      setMileage(event.target.value);
                    }}
                  />
                </Field>
                <Label className="operations-check">
                  <Checkbox
                    checked={readiness}
                    onCheckedChange={(checked) => {
                      changed();
                      setReadiness(checked === true);
                    }}
                  />
                  {m.ready}
                </Label>
              </div>
              <CostLines
                prefix="maintenance-complete"
                currency={r.currency}
                value={costs}
                onChange={(lines) => {
                  changed();
                  setCostLines(lines);
                }}
                disabled={pending}
              />
            </fieldset>
            {(error || stale) && (
              <p className="operations-feedback" role="alert">
                {error ?? m.conflict}
              </p>
            )}
            <div className="operations-form-actions">
              <Button disabled={pending || stale}>
                <CheckCircle2 className="size-4" aria-hidden />
                {m.complete}
              </Button>
              {stale && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void reloadDraft()}
                >
                  {m.reload}
                </Button>
              )}
              <Button
                type="button"
                disabled={pending}
                variant="outline"
                onClick={() => void cancelWork()}
              >
                {m.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      {canManage &&
        r.status === "completed" &&
        record.expenses &&
        (showCorrection ? (
          <MaintenanceCostCorrection
            agencyId={aid}
            record={r}
            expenses={record.expenses}
            onClose={() => {
              setShowCorrection(false);
              requestAnimationFrame(() =>
                document.getElementById("maintenance-correct-cost")?.focus(),
              );
            }}
          />
        ) : (
          <Button
            id="maintenance-correct-cost"
            variant="outline"
            className="min-h-11"
            onClick={() => setShowCorrection(true)}
          >
            {m.correctCost}
          </Button>
        ))}
      {error && r.status !== "in_progress" && (
        <p className="operations-feedback" role="alert">
          {error}
        </p>
      )}
      <PrivateEvidence
        agencyId={aid}
        vehicleId={r.vehicleId}
        owner={{ kind: "maintenance", id }}
        expectedRevision={r.revision}
        canManage={
          workspace.permissions.includes("maintenance.manage") &&
          (r.status === "planned" || r.status === "in_progress")
        }
      />
    </section>
  );
}
