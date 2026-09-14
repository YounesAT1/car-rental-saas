"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileLock2,
  Gauge,
  ShieldAlert,
  Upload,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { useI18n } from "@/i18n/client";
import { localizedLabel } from "@/lib/fleet";
import { operationsApi } from "@/lib/operations-api";
import { useOperationRequestKey } from "@/lib/use-operation-request-key";
import {
  localDateTimeValue,
  localInstant,
  localOffsets,
} from "@/lib/operations";
import { WorkspaceLoading } from "@/components/workspace-loading";

function formatDate(value: number | undefined, locale: string) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value)
    : "—";
}

export function VehicleOperations({
  agencyId,
  vehicleId,
}: {
  agencyId: string;
  vehicleId: string;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const aid = agencyId as Id<"agencies">;
  const vid = vehicleId as Id<"vehicles">;
  const workspace = useQuery(api.identity.getWorkspace, { agencyId: aid });
  const vehicle = useQuery(api.fleet.get, { agencyId: aid, vehicleId: vid });
  const summary = useQuery(api.operations.summary, {
    agencyId: aid,
    vehicleId: vid,
  });
  const {
    results: mileage,
    loadMore: loadMileage,
    status: mileageStatus,
  } = usePaginatedQuery(
    api.mileage.list,
    { agencyId: aid, vehicleId: vid },
    { initialNumItems: 10 },
  );
  const { results: maintenance } = usePaginatedQuery(
    operationsApi.maintenance.history,
    workspace?.permissions.includes("maintenance.read")
      ? { agencyId: aid, vehicleId: vid }
      : "skip",
    { initialNumItems: 6 },
  );
  const { results: inspections } = usePaginatedQuery(
    operationsApi.inspections.list,
    workspace?.permissions.includes("inspection.read")
      ? { agencyId: aid, vehicleId: vid }
      : "skip",
    { initialNumItems: 6 },
  );
  const { results: damages } = usePaginatedQuery(
    operationsApi.damage.history,
    workspace?.permissions.includes("damage.read")
      ? { agencyId: aid, vehicleId: vid }
      : "skip",
    { initialNumItems: 6 },
  );
  const compliance = useQuery(
    operationsApi.documents.compliance,
    workspace?.permissions.includes("document.vehicle.read")
      ? { agencyId: aid, vehicleId: vid }
      : "skip",
  );

  if (workspace === undefined || vehicle === undefined || summary === undefined)
    return (
      <section className="workspace-page operations-page">
        <WorkspaceLoading label={m.loading} variant="card" />
      </section>
    );
  if (!workspace || !vehicle)
    return (
      <section className="workspace-page operations-page">
        <p role="status">{m.denied}</p>
      </section>
    );

  const permissions = workspace.permissions;
  const canRead =
    permissions.includes("vehicle.read") ||
    permissions.includes("maintenance.read") ||
    permissions.includes("inspection.read") ||
    permissions.includes("document.vehicle.read");
  if (!canRead)
    return (
      <section className="workspace-page operations-page">
        <p role="status">{m.denied}</p>
      </section>
    );

  const readiness = summary.readiness;
  const ReadinessIcon =
    readiness === "ready"
      ? CheckCircle2
      : readiness === "blocked"
        ? ShieldAlert
        : AlertTriangle;
  const readinessText =
    readiness === "ready"
      ? m.ready
      : readiness === "blocked"
        ? m.blocked
        : m.needsReview;

  return (
    <section className="workspace-page operations-page">
      <Link
        href={`/app/${agencyId}/fleet/${vehicleId}`}
        className="workspace-backlink inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft className="directional-icon size-4" aria-hidden />
        {m.backToVehicle}
      </Link>
      <header className="settings-heading operations-heading">
        <p className="eyebrow">
          <bdi>{vehicle.fleetNumber}</bdi>
        </p>
        <h1>{m.vehicleOperations}</h1>
        <p>
          {vehicle.make} {vehicle.model} · {m.vehicleOperationsHint}
        </p>
      </header>

      <div className="operations-summary-grid">
        <Card className={`operations-readiness is-${readiness}`}>
          <ReadinessIcon className="size-6" aria-hidden />
          <div>
            <p>{m.readiness}</p>
            <h2>{readinessText}</h2>
          </div>
          <span>{summary.guard?.verified ? m.verified : m.notVerified}</span>
        </Card>
        <Card className="operations-metric">
          <Gauge className="size-5" aria-hidden />
          <p>{m.latestMileage}</p>
          <strong>
            {summary.guard?.mileageMeters === undefined
              ? "—"
              : new Intl.NumberFormat(locale, {
                  maximumFractionDigits: 0,
                }).format(summary.guard.mileageMeters / 1000)}{" "}
            km
          </strong>
          <span>
            {summary.guard?.mileageObservedAt
              ? formatDate(summary.guard.mileageObservedAt, locale)
              : m.noMileage}
          </span>
        </Card>
        <Card className="operations-metric">
          <Wrench className="size-5" aria-hidden />
          <p>{m.activeIssues}</p>
          <strong>{summary.issues.length}</strong>
          <span>{summary.issues[0]?.reason ?? m.noIssues}</span>
        </Card>
      </div>

      {permissions.includes("vehicle.update") && (
        <MileageForm
          agencyId={aid}
          vehicleId={vid}
          timezone={workspace.agency.timezone}
        />
      )}
      <HistoryCard
        title={m.mileage}
        empty={m.noMileage}
        rows={mileage.map((row) => ({
          id: row._id,
          title: `${new Intl.NumberFormat(locale).format(row.value)} ${row.unit}`,
          detail: row.reason || row.kind,
          date: formatDate(row.observedAt, locale),
        }))}
        canLoadMore={
          mileageStatus === "CanLoadMore" || mileageStatus === "LoadingMore"
        }
        loadingMore={mileageStatus === "LoadingMore"}
        onLoadMore={() => loadMileage(10)}
      />

      {permissions.includes("document.vehicle.read") && (
        <DocumentsCard
          agencyId={aid}
          vehicleId={vid}
          compliance={compliance ?? []}
          canManage={permissions.includes("document.vehicle.manage")}
        />
      )}

      <div className="operations-history-grid">
        {permissions.includes("maintenance.read") && (
          <HistoryCard
            title={m.maintenance}
            empty={m.empty}
            rows={maintenance.map((record) => ({
              id: record._id,
              title: record.title,
              detail: record.status.replaceAll("_", " "),
              date: formatDate(record.completedAt ?? record.recordedAt, locale),
              href: `/app/${agencyId}/maintenance/${record._id}`,
            }))}
          />
        )}
        {permissions.includes("inspection.read") && (
          <HistoryCard
            title={m.inspections}
            empty={m.empty}
            rows={inspections.map((record) => ({
              id: record._id,
              title: localizedLabel(record.templateName, locale),
              detail: record.status,
              date: formatDate(record.completedAt ?? record.recordedAt, locale),
              href: `/app/${agencyId}/inspections/${record._id}`,
            }))}
          />
        )}
        {permissions.includes("damage.read") && (
          <HistoryCard
            title={m.damages}
            empty={m.empty}
            rows={damages.map((record) => ({
              id: record._id,
              title: record.location,
              detail: `${record.severity} · ${record.status}`,
              date: formatDate(record.recordedAt, locale),
              href: `/app/${agencyId}/damage/${record._id}`,
            }))}
          />
        )}
      </div>
    </section>
  );
}

function MileageForm({
  agencyId,
  vehicleId,
  timezone,
}: {
  agencyId: Id<"agencies">;
  vehicleId: Id<"vehicles">;
  timezone: string;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const save = useMutation(api.mileage.save);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"km" | "mi">("km");
  const [observedAt, setObservedAt] = useState(() =>
    localDateTimeValue(Date.now(), timezone),
  );
  const [now] = useState(() => Date.now());
  const offsets = localOffsets(observedAt, timezone);
  const [offset, setOffset] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const requestKey = useOperationRequestKey(
    JSON.stringify({ value, unit, observedAt, offset, reason }),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(value);
    let when: number;
    try {
      when = localInstant(observedAt, timezone, offset || undefined);
    } catch {
      return setError(m.invalid);
    }
    if (!Number.isFinite(amount) || amount < 0) return setError(m.invalid);
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await save({
        agencyId,
        vehicleId,
        value: amount,
        unit,
        observedAt: when,
        reason,
        expectedRevision: 0,
        replacement: false,
        requestKey,
      });
      setValue("");
      setReason("");
      setSaved(true);
    } catch {
      setError(m.failed);
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
        <div className="settings-card-heading">
          <h2>{m.addMileage}</h2>
        </div>
        <div className="operations-fields operations-mileage-fields">
          <Field>
            <Label htmlFor="mileage-value">{m.value}</Label>
            <Input
              id="mileage-value"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </Field>
          {offsets.length > 1 && (
            <Field>
              <Label htmlFor="mileage-offset">{m.offset}</Label>
              <Select value={offset} onValueChange={setOffset}>
                <SelectTrigger id="mileage-offset" className="w-full">
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
            </Field>
          )}
          <Field>
            <Label htmlFor="mileage-unit">{m.unit}</Label>
            <Select
              value={unit}
              onValueChange={(next) => setUnit(next as "km" | "mi")}
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              <SelectTrigger id="mileage-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="km">{m.kilometers}</SelectItem>
                <SelectItem value="mi">{m.miles}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="mileage-time">{m.observedAt}</Label>
            <Input
              id="mileage-time"
              type="datetime-local"
              value={observedAt}
              onChange={(event) => setObservedAt(event.target.value)}
              max={localDateTimeValue(now, timezone)}
              required
            />
          </Field>
          <Field>
            <Label htmlFor="mileage-reason">{m.reason}</Label>
            <Input
              id="mileage-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
          </Field>
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
        <Button className="self-start" disabled={pending}>
          {m.addMileage}
        </Button>
      </form>
    </Card>
  );
}

type ComplianceItem = NonNullable<
  ReturnType<typeof useQuery<typeof operationsApi.documents.compliance>>
>[number];

function DocumentsCard({
  agencyId,
  vehicleId,
  compliance,
  canManage,
}: {
  agencyId: Id<"agencies">;
  vehicleId: Id<"vehicles">;
  compliance: ComplianceItem[];
  canManage: boolean;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const { getToken } = useAuth();
  const saveDraft = useMutation(operationsApi.documents.saveDraft);
  const begin = useMutation(operationsApi.privateFiles.begin);
  const [typeId, setTypeId] = useState("");
  const [number, setNumber] = useState("");
  const [issuer, setIssuer] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [intentId, setIntentId] = useState<Id<"privateUploadIntents"> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const intent = useQuery(
    operationsApi.privateFiles.status,
    intentId ? { intentId } : "skip",
  );
  const [openFileId, setOpenFileId] = useState<Id<"files"> | null>(null);
  const manifest = useQuery(
    operationsApi.privateFiles.manifest,
    openFileId ? { agencyId, fileId: openFileId } : "skip",
  );
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      typeId,
      number,
      issuer,
      issuedDate,
      expiryDate,
      file: file
        ? { name: file.name, size: file.size, lastModified: file.lastModified }
        : null,
    }),
  );

  async function uploadEvidence(documentId: Id<"vehicleDocuments">) {
    if (!file) return;
    if (!siteUrl || file.size > 3 * 1024 * 1024)
      throw new Error("PRIVATE_FILE_INVALID");
    const nextIntent = await begin({
      agencyId,
      vehicleId,
      owner: { kind: "document", id: documentId },
      expectedRevision: 0,
    });
    setIntentId(nextIntent);
    const token = await getToken({ template: "convex" });
    if (!token) throw new Error("AUTH_REQUIRED");
    const response = await fetch(
      `${siteUrl}/private-files/upload/${nextIntent}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      },
    );
    if (!response.ok) throw new Error("PRIVATE_FILE_INVALID");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!typeId) return setError(m.invalid);
    setPending(true);
    setError(null);
    try {
      const documentId = await saveDraft({
        agencyId,
        vehicleId,
        expectedRevision: 0,
        typeId: typeId as Id<"vehicleDocumentTypes">,
        number,
        issuer,
        issuedDate,
        expiryDate,
        requestKey,
      });
      await uploadEvidence(documentId);
      if (!file) {
        setNumber("");
        setIssuer("");
        setIssuedDate("");
        setExpiryDate("");
      }
    } catch {
      setError(file ? m.uploadFailed : m.failed);
    } finally {
      setPending(false);
    }
  }

  async function download(
    fileId: Id<"files">,
    pageId: Id<"privateFilePages">,
    position: number,
  ) {
    if (!siteUrl) return setError(m.failed);
    try {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("AUTH_REQUIRED");
      const response = await fetch(
        `${siteUrl}/private-files/download/${fileId}/${pageId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error("DOWNLOAD_FAILED");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `evidence-page-${position + 1}.webp`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setError(m.failed);
    }
  }

  return (
    <Card className="operations-form-card">
      <div className="settings-card-heading">
        <h2>{m.documents}</h2>
        <p>{m.evidenceHint}</p>
      </div>
      <div className="operations-compliance-list">
        {compliance.length === 0 ? (
          <p className="text-muted-foreground">{m.noDocumentTypes}</p>
        ) : (
          compliance.map((item) => (
            <div className="operations-compliance-row" key={item.type._id}>
              <FileLock2 className="size-5" aria-hidden />
              <div>
                <strong>{localizedLabel(item.type.labels, locale)}</strong>
                <span>{item.document?.expiryDate || m[item.state]}</span>
              </div>
              <span className={`operations-badge is-${item.state}`}>
                {m[item.state]}
              </span>
              {item.document?.fileId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpenFileId(item.document!.fileId!)}
                  aria-label={m.evidence}
                >
                  <Download className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
      {openFileId && manifest && (
        <div className="operations-pages" aria-label={m.evidence}>
          {manifest.map((page) => (
            <Button
              key={page.id}
              type="button"
              variant="outline"
              onClick={() => void download(openFileId, page.id, page.position)}
            >
              <Download className="size-4" aria-hidden />
              {m.downloadPage.replace("{page}", String(page.position + 1))}
            </Button>
          ))}
        </div>
      )}
      {canManage && (
        <form
          className="operations-form operations-document-form"
          onSubmit={(event) => void submit(event)}
        >
          <div className="operations-fields">
            <Field>
              <Label htmlFor="document-type">{m.documentType}</Label>
              <Select
                value={typeId}
                onValueChange={setTypeId}
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <SelectTrigger id="document-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {compliance.map((item) => (
                    <SelectItem key={item.type._id} value={item.type._id}>
                      {localizedLabel(item.type.labels, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <Label htmlFor="document-number">{m.documentNumber}</Label>
              <Input
                id="document-number"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                maxLength={120}
              />
            </Field>
            <Field>
              <Label htmlFor="document-issuer">{m.issuer}</Label>
              <Input
                id="document-issuer"
                value={issuer}
                onChange={(event) => setIssuer(event.target.value)}
                maxLength={160}
              />
            </Field>
            <Field>
              <Label htmlFor="document-issued">{m.issueDate}</Label>
              <Input
                id="document-issued"
                type="date"
                value={issuedDate}
                onChange={(event) => setIssuedDate(event.target.value)}
              />
            </Field>
            <Field>
              <Label htmlFor="document-expiry">{m.expiryDate}</Label>
              <Input
                id="document-expiry"
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </Field>
            <Field>
              <Label htmlFor="document-file">{m.chooseFile}</Label>
              <Input
                ref={fileInput}
                id="document-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </Field>
          </div>
          {intent && (
            <p className="operations-upload-status" role="status">
              <Upload className="size-4" aria-hidden />
              {intent.status === "done"
                ? m.saved
                : intent.status === "failed"
                  ? m.uploadFailed
                  : m.uploading}
            </p>
          )}
          {error && (
            <p className="operations-feedback" role="alert">
              {error}
            </p>
          )}
          <Button className="self-start" disabled={pending}>
            {file ? m.upload : m.saveDocument}
          </Button>
        </form>
      )}
    </Card>
  );
}

function HistoryCard({
  title,
  empty,
  rows,
  canLoadMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  title: string;
  empty: string;
  rows: Array<{
    id: string;
    title: string;
    detail: string;
    date: string;
    href?: string;
  }>;
  canLoadMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  return (
    <Card className="operations-history-card">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <div className="operations-history-list">
          {rows.map((row) => (
            <div key={row.id}>
              <div>
                <strong>{row.title}</strong>
                <span>
                  {row.detail} · {row.date}
                </span>
              </div>
              {row.href && (
                <Button asChild size="sm" variant="ghost">
                  <Link href={row.href}>{m.viewRecord}</Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {canLoadMore && onLoadMore && (
        <Button
          type="button"
          variant="outline"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {m.loadMore}
        </Button>
      )}
    </Card>
  );
}
