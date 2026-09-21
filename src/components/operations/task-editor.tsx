"use client";

import { useMutation, useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useConfirm } from "@/components/confirmation-provider";
import { useUnsavedChanges } from "@/components/settings/form-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
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
import { useOperationRequestKey } from "@/lib/use-operation-request-key";

export function TaskEditor({
  agencyId,
  task,
  current,
  canAssign,
  onClose,
}: {
  agencyId: Id<"agencies">;
  task: Doc<"operationalTasks">;
  current?: Doc<"operationalTasks">;
  canAssign: boolean;
  onClose: () => void;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const [captured, setCaptured] = useState(task);
  const [assignee, setAssignee] = useState(task.assigneeId ?? "");
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState(task.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignees = useQuery(
    api.tasks.assignees,
    canAssign ? { agencyId } : "skip",
  );
  const save = useMutation(api.tasks.save);
  const confirm = useConfirm();
  const dirty =
    assignee !== (captured.assigneeId ?? "") ||
    description !== captured.description ||
    status !== captured.status;
  useUnsavedChanges(dirty);
  const stale = !current || current.revision !== captured.revision;
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      id: captured._id,
      revision: captured.revision,
      assignee,
      description,
      status,
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
    if (
      !current ||
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setCaptured(current);
    setAssignee(current.assigneeId ?? "");
    setDescription(current.description);
    setStatus(current.status);
    setError(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        id: captured._id,
        expectedRevision: captured.revision,
        vehicleId: captured.vehicleId,
        title: captured.title,
        description,
        assigneeId: assignee ? (assignee as Id<"users">) : undefined,
        dueAt: captured.dueAt,
        status,
        priority: captured.priority,
        requestKey,
      });
      onClose();
    } catch (cause) {
      setError(
        String(cause).includes("CONFLICT")
          ? m.conflict
          : String(cause).includes("ASSIGNEE_UNAVAILABLE")
            ? m.assigneeUnavailable
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
        <h2>{captured.title}</h2>
        <fieldset disabled={pending} className="operations-fields">
          {canAssign && (
            <Field>
              <Label htmlFor="task-edit-assignee">{m.assignee}</Label>
              <Select
                value={assignee || "none"}
                onValueChange={(value) =>
                  setAssignee(value === "none" ? "" : value)
                }
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <SelectTrigger id="task-edit-assignee" className="w-full">
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
          )}
          <Field>
            <Label htmlFor="task-edit-status">{m.taskStatus}</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as typeof status)}
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              <SelectTrigger id="task-edit-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{m.openTask}</SelectItem>
                <SelectItem value="in_progress">{m.inProgress}</SelectItem>
                <SelectItem value="done">{m.done}</SelectItem>
                <SelectItem value="cancelled">{m.cancelled}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field className="operations-field-wide">
            <Label htmlFor="task-edit-description">{m.descriptionField}</Label>
            <Textarea
              autoFocus
              id="task-edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
          </Field>
        </fieldset>
        {(error || stale) && (
          <p role="alert" className="operations-feedback">
            {error ?? m.conflict}
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
