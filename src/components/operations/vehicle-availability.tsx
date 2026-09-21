"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
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
  localDateTimeValue,
  localInstant,
  localOffsets,
} from "@/lib/operations";
import { useOperationRequestKey } from "@/lib/use-operation-request-key";

type Editor =
  | { kind: "downtime"; row?: Doc<"vehicleAllocations"> }
  | { kind: "issue"; row?: Doc<"vehicleReadinessIssues"> };

export function VehicleAvailability({
  agencyId,
  vehicleId,
  timezone,
  canManage,
}: {
  agencyId: Id<"agencies">;
  vehicleId: Id<"vehicles">;
  timezone: string;
  canManage: boolean;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const confirm = useConfirm();
  const [active, setActive] = useState(true);
  const allocations = usePaginatedQuery(
    api.operations.allocationHistory,
    { agencyId, vehicleId, blocking: active },
    { initialNumItems: 10 },
  );
  const issues = usePaginatedQuery(
    api.operations.issueHistory,
    { agencyId, vehicleId, active },
    { initialNumItems: 10 },
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [reason, setReason] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [startOffset, setStartOffset] = useState("");
  const [endOffset, setEndOffset] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const saveDowntime = useMutation(api.operations.saveDowntime);
  const release = useMutation(api.operations.releaseDowntime);
  const manualIssue = useMutation(api.operations.manualIssue);
  const requestKey = useOperationRequestKey(
    JSON.stringify({ editor, reason, start, end, startOffset, endOffset }),
  );
  const dirty = Boolean(editor && (reason || start || end));
  useUnsavedChanges(dirty);
  const current = editor?.row
    ? (editor.kind === "downtime" ? allocations.results : issues.results).find(
        (row) => row._id === editor.row?._id,
      )
    : undefined;
  const stale = Boolean(
    editor?.row && (!current || current.revision !== editor.row.revision),
  );
  const date = (value: number) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(value);

  function open(next: Editor, target: HTMLElement) {
    trigger.current = target;
    setEditor(next);
    setError(null);
    setReason(next.kind === "downtime" ? (next.row?.reason ?? "") : "");
    setStart(
      next.kind === "downtime" && next.row
        ? localDateTimeValue(next.row.startAt, timezone)
        : "",
    );
    setEnd(
      next.kind === "downtime" && next.row
        ? localDateTimeValue(next.row.endAt, timezone)
        : "",
    );
    setStartOffset("");
    setEndOffset("");
  }
  async function close() {
    if (
      dirty &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setEditor(null);
    setError(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !reason.trim() || stale)
      return setError(stale ? m.conflict : m.invalid);
    setPending(true);
    setError(null);
    try {
      if (editor.kind === "downtime")
        await saveDowntime({
          agencyId,
          vehicleId,
          id: editor.row?._id,
          expectedRevision: editor.row?.revision ?? 0,
          startAt: localInstant(start, timezone, startOffset || undefined),
          endAt: localInstant(end, timezone, endOffset || undefined),
          reason,
          requestKey,
        });
      else
        await manualIssue({
          agencyId,
          vehicleId,
          id: editor.row?._id,
          expectedRevision: editor.row?.revision ?? 0,
          reason,
          resolve: Boolean(editor.row),
          requestKey,
        });
      setEditor(null);
      requestAnimationFrame(() => trigger.current?.focus());
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
  async function releaseRow(row: Doc<"vehicleAllocations">) {
    if (!(await confirm(m.releaseDowntime, { actionLabel: m.releaseDowntime })))
      return;
    setPending(true);
    setError(null);
    try {
      await release({
        agencyId,
        id: row._id,
        expectedRevision: row.revision,
        requestKey: `release-${row._id}-${row.revision}`,
      });
    } catch (cause) {
      setError(String(cause).includes("CONFLICT") ? m.conflict : m.failed);
    } finally {
      setPending(false);
    }
  }
  function sourceLink(source: Doc<"vehicleReadinessIssues">["source"]) {
    if (source.kind === "maintenance")
      return `/app/${agencyId}/maintenance/${source.id}`;
    if (source.kind === "inspection")
      return `/app/${agencyId}/inspections/${source.id}`;
    if (source.kind === "damage") return `/app/${agencyId}/damage/${source.id}`;
    return null;
  }
  return (
    <Card className="operations-history-card">
      <div className="settings-section-topline">
        <div>
          <h2>{m.availability}</h2>
          <p>{m.availabilityHint}</p>
        </div>
        <div className="operations-form-actions">
          <Button
            variant={active ? "secondary" : "ghost"}
            aria-pressed={active}
            disabled={pending || Boolean(editor)}
            onClick={() => setActive(true)}
          >
            {m.active}
          </Button>
          <Button
            variant={!active ? "secondary" : "ghost"}
            aria-pressed={!active}
            disabled={pending || Boolean(editor)}
            onClick={() => setActive(false)}
          >
            {m.resolvedHistory}
          </Button>
        </div>
      </div>
      {canManage && !editor && (
        <div className="operations-form-actions">
          <Button
            variant="outline"
            disabled={pending}
            onClick={(event) => open({ kind: "downtime" }, event.currentTarget)}
          >
            {m.addDowntime}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={(event) => open({ kind: "issue" }, event.currentTarget)}
          >
            {m.addManualIssue}
          </Button>
        </div>
      )}
      {canManage && editor && (
        <form
          className="operations-form"
          onSubmit={(event) => void submit(event)}
        >
          <h3>
            {editor.kind === "downtime"
              ? m.addDowntime
              : editor.row
                ? m.resolveIssue
                : m.addManualIssue}
          </h3>
          {editor.kind === "issue" && editor.row && <p>{editor.row.reason}</p>}
          <fieldset disabled={pending} className="operations-fields">
            {editor.kind === "downtime" && (
              <>
                <LocalTime
                  prefix="downtime-start"
                  label={m.plannedStart}
                  value={start}
                  onChange={setStart}
                  offset={startOffset}
                  setOffset={setStartOffset}
                  timezone={timezone}
                />
                <LocalTime
                  prefix="downtime-end"
                  label={m.plannedEnd}
                  value={end}
                  onChange={setEnd}
                  offset={endOffset}
                  setOffset={setEndOffset}
                  timezone={timezone}
                />
              </>
            )}
            <Field className="operations-field-wide">
              <Label htmlFor="availability-reason">
                {editor.kind === "issue" && editor.row
                  ? m.resolutionEvidence
                  : m.reason}
              </Label>
              <Textarea
                autoFocus
                id="availability-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                required
              />
            </Field>
          </fieldset>
          {stale && (
            <p role="alert" className="operations-feedback">
              {m.conflict}
            </p>
          )}
          <div className="operations-form-actions">
            <Button disabled={pending || stale}>{m.saveDraft}</Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void close()}
            >
              {m.cancel}
            </Button>
            {stale && current && (
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
                    open(
                      editor.kind === "downtime"
                        ? {
                            kind: "downtime",
                            row: current as Doc<"vehicleAllocations">,
                          }
                        : {
                            kind: "issue",
                            row: current as Doc<"vehicleReadinessIssues">,
                          },
                      trigger.current!,
                    );
                }}
              >
                {m.reload}
              </Button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="operations-feedback">
          {error}
        </p>
      )}
      <h3>{m.downtime}</h3>
      {allocations.status === "LoadingFirstPage" ? (
        <p role="status">{m.loading}</p>
      ) : allocations.results.length === 0 ? (
        <p>{m.empty}</p>
      ) : (
        <div className="operations-history-list">
          {allocations.results.map((row) => (
            <div key={row._id}>
              <div>
                <strong>{row.reason}</strong>
                <span>
                  {date(row.startAt)} – {date(row.endAt)} ·{" "}
                  {row.kind === "manual"
                    ? m.manual
                    : row.kind === "maintenance"
                      ? m.maintenance
                      : m.inspections}
                </span>
              </div>
              {canManage && row.blocking && row.source.kind === "manual" && (
                <div className="operations-form-actions">
                  <Button
                    variant="ghost"
                    disabled={pending || Boolean(editor)}
                    onClick={(event) =>
                      open({ kind: "downtime", row }, event.currentTarget)
                    }
                  >
                    {m.editCatalog}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending || Boolean(editor)}
                    onClick={() => void releaseRow(row)}
                  >
                    {m.releaseDowntime}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {(allocations.status === "CanLoadMore" ||
        allocations.status === "LoadingMore") && (
        <Button
          variant="outline"
          disabled={allocations.status === "LoadingMore"}
          onClick={() => allocations.loadMore(10)}
        >
          {m.loadMore}
        </Button>
      )}
      <h3>{m.readiness}</h3>
      {issues.status === "LoadingFirstPage" ? (
        <p role="status">{m.loading}</p>
      ) : issues.results.length === 0 ? (
        <p>{m.noIssues}</p>
      ) : (
        <div className="operations-history-list">
          {issues.results.map((row) => {
            const href = sourceLink(row.source);
            return (
              <div key={row._id}>
                <div>
                  <strong>{row.reason}</strong>
                  <span>
                    {date(row.recordedAt)}
                    {row.resolution ? ` · ${row.resolution}` : ""}
                  </span>
                </div>
                {href && (
                  <Button variant="ghost" asChild>
                    <Link href={href}>{m.viewRecord}</Link>
                  </Button>
                )}
                {canManage && row.active && row.source.kind === "manual" && (
                  <Button
                    variant="outline"
                    disabled={pending || Boolean(editor)}
                    onClick={(event) =>
                      open({ kind: "issue", row }, event.currentTarget)
                    }
                  >
                    {m.resolveIssue}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {(issues.status === "CanLoadMore" || issues.status === "LoadingMore") && (
        <Button
          variant="outline"
          disabled={issues.status === "LoadingMore"}
          onClick={() => issues.loadMore(10)}
        >
          {m.loadMore}
        </Button>
      )}
    </Card>
  );
}

function LocalTime({
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
        required
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
            {offsets.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
