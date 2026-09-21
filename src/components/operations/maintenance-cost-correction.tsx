"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MaintenanceView } from "@/lib/operations-api";
import { useConfirm } from "@/components/confirmation-provider";
import { useUnsavedChanges } from "@/components/settings/form-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/client";
import { useOperationRequestKey } from "@/lib/use-operation-request-key";
import { CostLines, costDraft, parseCostDraft } from "./cost-lines";

export function MaintenanceCostCorrection({
  agencyId,
  record,
  expenses,
  onClose,
}: {
  agencyId: Id<"agencies">;
  record: MaintenanceView;
  expenses: Doc<"expenses">[];
  onClose: () => void;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  const save = useMutation(api.maintenance.correctCost);
  const confirm = useConfirm();
  function initialLines() {
    const reversed = new Set(
      expenses.flatMap((expense) =>
        expense.reversesId ? [expense.reversesId] : [],
      ),
    );
    const current = [...expenses]
      .reverse()
      .find((expense) => expense.amountMinor > 0 && !reversed.has(expense._id));
    return costDraft(
      current
        ? [
            {
              kind: "other",
              description: current.description,
              amountMinor: current.amountMinor,
            },
          ]
        : [],
      record.currency,
    );
  }
  const [lines, setLines] = useState(initialLines);
  const [revision, setRevision] = useState(record.revision);
  const [reason, setReason] = useState("");
  const [initial, setInitial] = useState(() =>
    JSON.stringify({ lines, reason: "" }),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify({ lines, reason }) !== initial;
  useUnsavedChanges(dirty);
  const requestKey = useOperationRequestKey(
    JSON.stringify({ id: record._id, revision, reason, lines }),
  );
  const stale = revision !== record.revision;
  async function close() {
    if (
      !dirty ||
      (await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      onClose();
  }
  async function reload() {
    if (
      dirty &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    const next = initialLines();
    setLines(next);
    setRevision(record.revision);
    setReason("");
    setInitial(JSON.stringify({ lines: next, reason: "" }));
    setError(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let replacementLines;
    try {
      if (!reason.trim()) throw new Error();
      replacementLines = parseCostDraft(lines, record.currency);
    } catch {
      setError(m.invalid);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        id: record._id,
        expectedRevision: revision,
        replacementLines,
        expectedCurrency: record.currency,
        reason,
        requestKey,
      });
      onClose();
    } catch (cause) {
      setError(String(cause).includes("CONFLICT") ? m.conflict : m.failed);
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="operations-form-card">
      <form
        className="operations-form operations-cost-correction"
        onSubmit={(event) => void submit(event)}
      >
        <div className="settings-card-heading">
          <h2>{m.correctCost}</h2>
          <p>{m.costCorrectionHint}</p>
        </div>
        <CostLines
          prefix="cost-correction"
          currency={record.currency}
          value={lines}
          onChange={setLines}
          disabled={pending}
        />
        <Field>
          <Label htmlFor="cost-correction-reason">{m.reason}</Label>
          <Textarea
            id="cost-correction-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            required
            disabled={pending}
          />
        </Field>
        {(error || stale) && (
          <p role="alert" className="operations-feedback">
            {error ?? m.conflict}
          </p>
        )}
        <div className="operations-form-actions">
          <Button disabled={pending || stale}>
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
