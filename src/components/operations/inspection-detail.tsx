"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
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
import { useI18n } from "@/i18n/client";
import { localizedLabel } from "@/lib/fleet";
import { operationsApi } from "@/lib/operations-api";
import { api } from "../../../convex/_generated/api";
import { PrivateEvidence } from "./private-evidence";

type InspectionItem = Doc<"vehicleInspections">["items"][number];
type InspectionDraft = {
  revision: number;
  items: InspectionItem[];
  notes: string;
  fuelPercent: string;
  acknowledgment: boolean;
};

export function InspectionDetail({
  agencyId,
  inspectionId,
}: {
  agencyId: string;
  inspectionId: string;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const aid = agencyId as Id<"agencies">;
  const id = inspectionId as Id<"vehicleInspections">;
  const workspace = useQuery(api.identity.getWorkspace, { agencyId: aid });
  const record = useQuery(operationsApi.inspections.get, { agencyId: aid, id });
  const [draft, setDraft] = useState<InspectionDraft | null>(null);
  const draftRef = useRef<InspectionDraft | null>(null);
  const [mileage, setMileage] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(operationsApi.inspections.save);
  const complete = useMutation(operationsApi.inspections.complete);

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
  const inspection = record;
  const currentDraft =
    draft?.revision === inspection.revision
      ? draft
      : {
          revision: inspection.revision,
          items: inspection.items,
          notes: inspection.notes,
          fuelPercent: String(inspection.fuelPercent),
          acknowledgment: inspection.acknowledgment,
        };
  const canManage = workspace.permissions.includes("inspection.manage");

  function updateDraft(update: (source: InspectionDraft) => InspectionDraft) {
    const source =
      draftRef.current?.revision === inspection.revision
        ? draftRef.current
        : currentDraft;
    const next = update(source);
    draftRef.current = next;
    setDraft(next);
  }

  async function saveInspection() {
    const formDraft =
      draftRef.current?.revision === inspection.revision
        ? draftRef.current
        : currentDraft;
    const fuel = Number(formDraft.fuelPercent);
    if (!Number.isFinite(fuel) || fuel < 0 || fuel > 100)
      return setError(m.invalid);
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await save({
        agencyId: aid,
        id,
        expectedRevision: inspection.revision,
        items: formDraft.items.map(({ code, result, notes: itemNotes }) => ({
          code,
          result,
          notes: itemNotes,
        })),
        notes: formDraft.notes,
        fuelPercent: fuel,
        acknowledgment: formDraft.acknowledgment,
        requestKey: crypto.randomUUID(),
      });
      const nextDraft = {
        ...formDraft,
        revision: inspection.revision + 1,
      };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setSaved(true);
    } catch {
      setError(m.failed);
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    const formDraft =
      draftRef.current?.revision === inspection.revision
        ? draftRef.current
        : currentDraft;
    const reading = mileage.trim() ? Number(mileage) : undefined;
    if (reading !== undefined && (!Number.isFinite(reading) || reading < 0))
      return setError(m.invalid);
    setPending(true);
    setError(null);
    try {
      await complete({
        agencyId: aid,
        id,
        expectedRevision: formDraft.revision,
        mileage:
          reading === undefined
            ? undefined
            : { value: reading, unit: "km", observedAt: Date.now() },
        requestKey: crypto.randomUUID(),
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
        href={`/app/${agencyId}/inspections`}
        className="workspace-backlink inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft className="directional-icon size-4" aria-hidden />
        {m.inspections}
      </Link>
      <header className="settings-heading operations-heading">
        <p className="eyebrow">{m.inspections}</p>
        <h1>{localizedLabel(record.templateName, locale)}</h1>
        <p>
          {record.type.replaceAll("_", " ")} ·{" "}
          {inspectionStatus(record.status, m)}
        </p>
      </header>
      <Card className="operations-form-card">
        <div className="settings-card-heading">
          <h2>{m.checklist}</h2>
        </div>
        <div className="operations-checklist">
          {currentDraft.items.map((item, index) => (
            <div className="operations-checklist-row" key={item.code}>
              <div>
                <strong>{localizedLabel(item.labels, locale)}</strong>
                {item.safety && (
                  <span>
                    <AlertTriangle className="size-3" aria-hidden /> {m.safety}
                  </span>
                )}
              </div>
              <Select
                disabled={!canManage || record.status !== "draft"}
                value={item.result}
                onValueChange={(result) =>
                  updateDraft((source) => ({
                    ...source,
                    items: source.items.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? {
                            ...candidate,
                            result: result as InspectionItem["result"],
                          }
                        : candidate,
                    ),
                  }))
                }
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <SelectTrigger
                  aria-label={localizedLabel(item.labels, locale)}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unchecked">{m.unchecked}</SelectItem>
                  <SelectItem value="pass">{m.pass}</SelectItem>
                  <SelectItem value="fail">{m.fail}</SelectItem>
                  <SelectItem value="not_applicable">
                    {m.notApplicable}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input
                disabled={!canManage || record.status !== "draft"}
                aria-label={`${localizedLabel(item.labels, locale)}: ${m.findings}`}
                value={item.notes}
                onChange={(event) =>
                  updateDraft((source) => ({
                    ...source,
                    items: source.items.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, notes: event.target.value }
                        : candidate,
                    ),
                  }))
                }
                maxLength={500}
              />
            </div>
          ))}
        </div>
        {record.status === "draft" && canManage && (
          <div className="operations-form">
            <div className="operations-fields">
              <Field className="operations-field-wide">
                <Label htmlFor="inspection-notes">{m.findings}</Label>
                <Textarea
                  id="inspection-notes"
                  value={currentDraft.notes}
                  onChange={(event) =>
                    updateDraft((source) => ({
                      ...source,
                      notes: event.target.value,
                    }))
                  }
                  maxLength={4000}
                />
              </Field>
              <Field>
                <Label htmlFor="inspection-fuel">{m.fuelPercent}</Label>
                <Input
                  id="inspection-fuel"
                  inputMode="numeric"
                  value={currentDraft.fuelPercent}
                  onChange={(event) =>
                    updateDraft((source) => ({
                      ...source,
                      fuelPercent: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <Label htmlFor="inspection-mileage">
                  {m.latestMileage} (km)
                </Label>
                <Input
                  id="inspection-mileage"
                  inputMode="decimal"
                  value={mileage}
                  onChange={(event) => setMileage(event.target.value)}
                />
              </Field>
              <Label className="operations-check operations-field-wide">
                <Checkbox
                  checked={currentDraft.acknowledgment}
                  onCheckedChange={(checked) =>
                    updateDraft((source) => ({
                      ...source,
                      acknowledgment: checked === true,
                    }))
                  }
                />
                {m.acknowledgment}
              </Label>
            </div>
            {error && (
              <p className="operations-feedback" role="alert">
                {error}
              </p>
            )}
            {saved && (
              <p className="operations-saved" role="status">
                {m.saved}
              </p>
            )}
            <div className="operations-form-actions">
              <Button disabled={pending} onClick={() => void saveInspection()}>
                {m.saveDraft}
              </Button>
              <Button
                disabled={pending || !saved}
                variant="outline"
                onClick={() => void finish()}
              >
                <CheckCircle2 className="size-4" aria-hidden />
                {m.complete}
              </Button>
            </div>
          </div>
        )}
      </Card>
      <PrivateEvidence
        agencyId={aid}
        vehicleId={record.vehicleId}
        owner={{ kind: "inspection", id }}
        expectedRevision={record.revision}
        canManage={canManage && record.status === "draft"}
      />
      {record.status === "completed" &&
        workspace.permissions.includes("damage.manage") && (
          <DamageForm
            agencyId={aid}
            inspection={record}
            currency={workspace.agency.currency}
          />
        )}
    </section>
  );
}

function inspectionStatus(
  status: Doc<"vehicleInspections">["status"],
  messages: { draft: string; completed: string; cancelled: string },
) {
  return status === "draft"
    ? messages.draft
    : status === "completed"
      ? messages.completed
      : messages.cancelled;
}

function DamageForm({
  agencyId,
  inspection,
  currency,
}: {
  agencyId: Id<"agencies">;
  inspection: Doc<"vehicleInspections">;
  currency: string;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const report = useMutation(operationsApi.damage.report);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"notice" | "blocking">("notice");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location.trim() || !description.trim()) return setError(m.invalid);
    setPending(true);
    setError(null);
    try {
      const damageId = await report({
        agencyId,
        vehicleId: inspection.vehicleId,
        inspectionId: inspection._id,
        location,
        description,
        severity,
        responsibility: "unknown",
        disputed: false,
        expectedCurrency: currency,
        requestKey: crypto.randomUUID(),
      });
      setLocation("");
      setDescription("");
      setOpen(false);
      router.push(`/app/${agencyId}/damage/${damageId}`);
    } catch {
      setError(m.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="operations-form-card">
      <div className="settings-section-topline">
        <div>
          <h2>{m.damages}</h2>
          <p>{m.findings}</p>
        </div>
        <Button variant="outline" onClick={() => setOpen(!open)}>
          <Plus className="size-4" aria-hidden />
          {m.reported}
        </Button>
      </div>
      {open && (
        <form
          className="operations-form"
          onSubmit={(event) => void submit(event)}
        >
          <div className="operations-fields">
            <Field>
              <Label htmlFor="damage-location">{m.reason}</Label>
              <Input
                id="damage-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={160}
                required
              />
            </Field>
            <Field>
              <Label htmlFor="damage-severity">{m.priority}</Label>
              <Select
                value={severity}
                onValueChange={(value) => setSeverity(value as typeof severity)}
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <SelectTrigger id="damage-severity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notice">{m.normal}</SelectItem>
                  <SelectItem value="blocking">{m.blocked}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className="operations-field-wide">
              <Label htmlFor="damage-description">{m.descriptionField}</Label>
              <Textarea
                id="damage-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                required
              />
            </Field>
          </div>
          {error && (
            <p className="operations-feedback" role="alert">
              {error}
            </p>
          )}
          <Button className="self-start" disabled={pending}>
            {m.reported}
          </Button>
        </form>
      )}
    </Card>
  );
}
