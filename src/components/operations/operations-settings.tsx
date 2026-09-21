"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ArrowLeft, FileCheck2, Plus, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { useI18n } from "@/i18n/client";
import { localizedLabel } from "@/lib/fleet";
import { useOperationRequestKey } from "@/lib/use-operation-request-key";
import { operationsApi } from "@/lib/operations-api";
import { useConfirm } from "@/components/confirmation-provider";
import { useUnsavedChanges } from "@/components/settings/form-fields";

export function OperationsSettings({ agencyId }: { agencyId: string }) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const aid = agencyId as Id<"agencies">;
  const workspace = useQuery(api.identity.getWorkspace, { agencyId: aid });
  const canReadDocuments =
    workspace?.permissions.includes("document.vehicle.read") ?? false;
  const canReadInspections =
    workspace?.permissions.includes("inspection.read") ?? false;
  const canReadMaintenance =
    workspace?.permissions.includes("maintenance.read") ?? false;
  const [documentId, setDocumentId] =
    useState<Id<"vehicleDocumentTypes"> | null>(null);
  const [templateId, setTemplateId] =
    useState<Id<"inspectionTemplates"> | null>(null);
  const [vendorId, setVendorId] = useState<Id<"maintenanceVendors"> | null>(
    null,
  );
  const [activeTemplates, setActiveTemplates] = useState(true);
  const [documentEditing, setDocumentEditing] = useState(false);
  const [templateEditing, setTemplateEditing] = useState(false);
  const [vendorEditing, setVendorEditing] = useState(false);
  const selectedTemplate = useQuery(
    api.operationCatalogs.getTemplate,
    canReadInspections && templateId
      ? { agencyId: aid, id: templateId }
      : "skip",
  );
  const documentTypes = useQuery(
    operationsApi.catalogs.documentTypes,
    canReadDocuments ? { agencyId: aid } : "skip",
  );
  const templates = usePaginatedQuery(
    api.operationCatalogs.templateHistory,
    canReadInspections ? { agencyId: aid, active: activeTemplates } : "skip",
    { initialNumItems: 20 },
  );
  const vendors = useQuery(
    operationsApi.catalogs.vendors,
    canReadMaintenance ? { agencyId: aid } : "skip",
  );

  if (workspace === undefined)
    return (
      <section className="workspace-page operations-page">
        <WorkspaceLoading label={m.loading} variant="card" />
      </section>
    );
  if (
    !workspace ||
    (!canReadDocuments && !canReadInspections && !canReadMaintenance)
  )
    return (
      <section className="workspace-page operations-page">
        <p role="status">{m.denied}</p>
      </section>
    );

  return (
    <section className="workspace-page operations-page">
      <Link
        href={`/app/${agencyId}/operations`}
        className="workspace-backlink inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft className="directional-icon size-4" aria-hidden />
        {m.overview}
      </Link>
      <header className="settings-heading operations-heading">
        <p className="eyebrow">{workspace.agency.name}</p>
        <h1>{m.settings}</h1>
        <p>{m.setupHint}</p>
      </header>
      <div className="operations-settings-grid">
        {canReadDocuments && (
          <CatalogCard
            icon={FileCheck2}
            title={m.documentTypes}
            empty={m.noDocumentTypes}
            rows={(documentTypes ?? []).map((item) => ({
              id: item._id,
              title: localizedLabel(item.labels, locale),
              meta: `${item.code} · ${item.active ? m.active : m.cancelled}`,
              actions: workspace.permissions.includes(
                "document.vehicle.manage",
              ) && (
                <CatalogActions
                  kind="document"
                  disabled={documentEditing}
                  agencyId={aid}
                  row={item}
                  onEdit={() => setDocumentId(item._id)}
                />
              ),
            }))}
          >
            {workspace.permissions.includes("document.vehicle.manage") && (
              <DocumentTypeForm
                key={documentId ?? "new"}
                agencyId={aid}
                row={documentTypes?.find((row) => row._id === documentId)}
                onClose={() => setDocumentId(null)}
                onEditing={setDocumentEditing}
              />
            )}
          </CatalogCard>
        )}
        {canReadInspections && (
          <CatalogCard
            icon={ShieldCheck}
            title={m.templates}
            empty={m.noTemplates}
            rows={templates.results.map(({ template: item, latest }) => ({
              id: item._id,
              title: localizedLabel(item.name, locale),
              meta: `${item.code} · v${item.version} · ${item.items.length} ${m.checklist}${latest ? "" : ` · ${m.historicalVersion}`}`,
              actions: latest &&
                workspace.permissions.includes("inspection.manage") && (
                  <CatalogActions
                    kind="template"
                    disabled={templateEditing}
                    agencyId={aid}
                    row={item}
                    onEdit={() => setTemplateId(item._id)}
                  />
                ),
            }))}
          >
            <div className="operations-form-actions">
              <Button
                aria-pressed={activeTemplates}
                disabled={templateEditing}
                variant={activeTemplates ? "secondary" : "ghost"}
                onClick={() => {
                  setActiveTemplates(true);
                  setTemplateId(null);
                }}
              >
                {m.active}
              </Button>
              <Button
                aria-pressed={!activeTemplates}
                disabled={templateEditing}
                variant={!activeTemplates ? "secondary" : "ghost"}
                onClick={() => {
                  setActiveTemplates(false);
                  setTemplateId(null);
                }}
              >
                {m.archivedCatalog}
              </Button>
            </div>
            {(templates.status === "CanLoadMore" ||
              templates.status === "LoadingMore") && (
              <Button
                variant="outline"
                disabled={templates.status === "LoadingMore"}
                onClick={() => templates.loadMore(20)}
              >
                {m.loadMore}
              </Button>
            )}
            {workspace.permissions.includes("inspection.manage") &&
              activeTemplates &&
              (!templateId || selectedTemplate) && (
                <TemplateForm
                  key={templateId ?? "new"}
                  agencyId={aid}
                  row={selectedTemplate ?? undefined}
                  onClose={() => setTemplateId(null)}
                  onEditing={setTemplateEditing}
                />
              )}
          </CatalogCard>
        )}
        {canReadMaintenance && (
          <CatalogCard
            icon={Wrench}
            title={m.vendors}
            empty={m.noVendors}
            rows={(vendors ?? []).map((item) => ({
              id: item._id,
              title: item.name,
              meta:
                [item.phone, item.email].filter(Boolean).join(" · ") ||
                item.address ||
                "—",
              actions: workspace.permissions.includes("maintenance.manage") && (
                <CatalogActions
                  kind="vendor"
                  disabled={vendorEditing}
                  agencyId={aid}
                  row={item}
                  onEdit={() => setVendorId(item._id)}
                />
              ),
            }))}
          >
            {workspace.permissions.includes("maintenance.manage") && (
              <VendorForm
                key={vendorId ?? "new"}
                agencyId={aid}
                row={vendors?.find((row) => row._id === vendorId)}
                onClose={() => setVendorId(null)}
                onEditing={setVendorEditing}
              />
            )}
          </CatalogCard>
        )}
      </div>
    </section>
  );
}

function restoreCatalogFocus(id: string | undefined, prefix: string) {
  requestAnimationFrame(() => {
    const target = id
      ? document.querySelector<HTMLElement>(`[data-catalog-id="${id}"] button`)
      : document.getElementById(`${prefix}-add`);
    target?.focus();
  });
}

function CatalogCard({
  icon: Icon,
  title,
  empty,
  rows,
  children,
}: {
  icon: typeof FileCheck2;
  title: string;
  empty: string;
  rows: Array<{
    id: string;
    title: string;
    meta: string;
    actions?: React.ReactNode;
  }>;
  children?: React.ReactNode;
}) {
  return (
    <Card className="operations-catalog-card">
      <div className="operations-catalog-title">
        <Icon className="size-5" aria-hidden />
        <h2>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <div className="operations-catalog-list">
          {rows.map((row) => (
            <div key={row.id} data-catalog-id={row.id}>
              <strong>{row.title}</strong>
              <span>{row.meta}</span>
              {row.actions}
            </div>
          ))}
        </div>
      )}
      {children}
    </Card>
  );
}

type CatalogActionProps = {
  agencyId: Id<"agencies">;
  onEdit: () => void;
  disabled: boolean;
} & (
  | { kind: "document"; row: Doc<"vehicleDocumentTypes"> }
  | { kind: "template"; row: Doc<"inspectionTemplates"> }
  | { kind: "vendor"; row: Doc<"maintenanceVendors"> }
);
function CatalogActions(props: CatalogActionProps) {
  const {
    messages: { operations: m },
  } = useI18n();
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const document = useMutation(operationsApi.catalogs.saveDocumentType);
  const vendor = useMutation(operationsApi.catalogs.saveVendor);
  const template = useMutation(api.operationCatalogs.setTemplateActive);
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      kind: props.kind,
      id: props.row._id,
      revision: props.row.revision,
      active: !props.row.active,
    }),
  );
  async function toggle() {
    if (
      props.row.active &&
      !(await confirm(m.archiveCatalogHint, {
        actionLabel: m.archiveCatalog,
        destructive: true,
      }))
    )
      return;
    setPending(true);
    setError(null);
    try {
      const base = {
        agencyId: props.agencyId,
        expectedRevision: props.row.revision,
        active: !props.row.active,
        requestKey,
      };
      if (props.kind === "document")
        await document({
          ...base,
          id: props.row._id,
          code: props.row.code,
          labels: props.row.labels,
          required: props.row.required,
          expiryRequired: props.row.expiryRequired,
        });
      else if (props.kind === "vendor")
        await vendor({
          ...base,
          id: props.row._id,
          name: props.row.name,
          phone: props.row.phone,
          email: props.row.email,
          address: props.row.address,
        });
      else await template({ ...base, id: props.row._id });
    } catch (cause) {
      setError(
        String(cause).includes("CONFLICT")
          ? m.conflict
          : String(cause).includes("LIMIT")
            ? m.catalogLimit
            : m.failed,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="operations-catalog-actions">
      <div className="operations-form-actions">
        {(props.kind !== "template" || props.row.active) && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending || props.disabled}
            onClick={props.onEdit}
          >
            {m.editCatalog}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={pending || props.disabled}
          onClick={() => void toggle()}
        >
          {props.row.active ? m.archiveCatalog : m.restoreCatalog}
        </Button>
      </div>
      {error && (
        <p role="alert" className="operations-feedback">
          {error}
        </p>
      )}
    </div>
  );
}

function DocumentTypeForm({
  agencyId,
  row,
  onClose,
  onEditing,
}: {
  agencyId: Id<"agencies">;
  row?: Doc<"vehicleDocumentTypes">;
  onClose: () => void;
  onEditing: (open: boolean) => void;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  const save = useMutation(operationsApi.catalogs.saveDocumentType);
  const [open, setOpen] = useState(Boolean(row));
  useEffect(() => onEditing(open), [open, onEditing]);
  const [revision, setRevision] = useState(row?.revision ?? 0);
  const [code, setCode] = useState(row?.code ?? "");
  const [en, setEn] = useState(row?.labels.en ?? "");
  const [fr, setFr] = useState(row?.labels.fr ?? "");
  const [ar, setAr] = useState(row?.labels.ar ?? "");
  const [required, setRequired] = useState(row?.required ?? false);
  const [expiry, setExpiry] = useState(row?.expiryRequired ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const dirty =
    JSON.stringify({ code, en, fr, ar, required, expiry }) !==
    JSON.stringify({
      code: row?.code ?? "",
      en: row?.labels.en ?? "",
      fr: row?.labels.fr ?? "",
      ar: row?.labels.ar ?? "",
      required: row?.required ?? false,
      expiry: row?.expiryRequired ?? false,
    });
  const stale = Boolean(row && revision !== row.revision);
  useUnsavedChanges(open && dirty);
  async function close() {
    if (
      dirty &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setOpen(false);
    if (!row) {
      setCode("");
      setEn("");
      setFr("");
      setAr("");
      setRequired(false);
      setExpiry(false);
      setError(null);
    }
    onClose();
    restoreCatalogFocus(row?._id, "document-type");
  }
  async function reload() {
    if (
      !row ||
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setRevision(row.revision);
    setCode(row.code);
    setEn(row.labels.en);
    setFr(row.labels.fr);
    setAr(row.labels.ar);
    setRequired(row.required);
    setExpiry(row.expiryRequired);
    setError(null);
  }
  const requestKey = useOperationRequestKey(
    JSON.stringify({
      id: row?._id,
      revision,
      code,
      en,
      fr,
      ar,
      required,
      expiry,
    }),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        id: row?._id,
        expectedRevision: revision,
        requestKey,
        code,
        labels: { en, fr, ar },
        required,
        expiryRequired: expiry,
        active: row?.active ?? true,
      });
      setCode("");
      setEn("");
      setFr("");
      setAr("");
      setOpen(false);
      onClose();
    } catch (cause) {
      setError(
        String(cause).includes("CONFLICT")
          ? m.conflict
          : String(cause).includes("CODE_TAKEN")
            ? m.catalogCodeTaken
            : String(cause).includes("LIMIT")
              ? m.catalogLimit
              : m.failed,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="operations-catalog-form">
      {!open && (
        <Button
          id="document-type-add"
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" aria-hidden />
          {m.addDocumentType}
        </Button>
      )}
      {open && (
        <form
          className="operations-form"
          onSubmit={(event) => void submit(event)}
        >
          <fieldset disabled={pending} className="operations-form">
            <CatalogLabels
              prefix="document-type"
              disabledCode={Boolean(row)}
              code={code}
              setCode={setCode}
              en={en}
              setEn={setEn}
              fr={fr}
              setFr={setFr}
              ar={ar}
              setAr={setAr}
            />
            <Label className="operations-check">
              <Checkbox
                checked={required}
                onCheckedChange={(value) => setRequired(value === true)}
              />
              {m.required}
            </Label>
            <Label className="operations-check">
              <Checkbox
                checked={expiry}
                onCheckedChange={(value) => setExpiry(value === true)}
              />
              {m.expiryRequired}
            </Label>
          </fieldset>
          {(error || stale) && (
            <p className="operations-feedback" role="alert">
              {error ?? m.conflict}
            </p>
          )}
          <div className="operations-form-actions">
            <Button disabled={pending || stale}>
              {row ? m.saveDraft : m.addDocumentType}
            </Button>
            <Button
              type="button"
              variant="outline"
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
      )}
    </div>
  );
}

const defaultChecklist: Doc<"inspectionTemplates">["items"] = [
  ["EXTERIOR", "Exterior", "Extérieur", "الهيكل الخارجي", false],
  ["TYRES", "Tyres", "Pneus", "الإطارات", true],
  ["LIGHTS", "Lights", "Feux", "الأضواء", true],
  ["FLUIDS", "Fluids", "Fluides", "السوائل", true],
  ["CLEANLINESS", "Cleanliness", "Propreté", "النظافة", false],
  ["EQUIPMENT", "Equipment", "Équipement", "التجهيزات", false],
].map(([code, en, fr, ar, safety]) => ({
  code: String(code),
  labels: { en: String(en), fr: String(fr), ar: String(ar) },
  safety: Boolean(safety),
  required: true,
}));

function TemplateForm({
  agencyId,
  row,
  onClose,
  onEditing,
}: {
  agencyId: Id<"agencies">;
  row?: Doc<"inspectionTemplates">;
  onClose: () => void;
  onEditing: (open: boolean) => void;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  const save = useMutation(operationsApi.catalogs.saveTemplate);
  const [open, setOpen] = useState(Boolean(row));
  useEffect(() => onEditing(open), [open, onEditing]);
  const [revision, setRevision] = useState(row?.revision ?? 0);
  const [code, setCode] = useState(row?.code ?? "");
  const [en, setEn] = useState(row?.name.en ?? "");
  const [fr, setFr] = useState(row?.name.fr ?? "");
  const [ar, setAr] = useState(row?.name.ar ?? "");
  const [items, setItems] = useState(row?.items ?? defaultChecklist);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const dirty =
    JSON.stringify({ code, en, fr, ar, items }) !==
    JSON.stringify({
      code: row?.code ?? "",
      en: row?.name.en ?? "",
      fr: row?.name.fr ?? "",
      ar: row?.name.ar ?? "",
      items: row?.items ?? defaultChecklist,
    });
  const stale = Boolean(row && (revision !== row.revision || !row.active));
  useUnsavedChanges(open && dirty);
  async function close() {
    if (
      dirty &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setOpen(false);
    if (!row) {
      setCode("");
      setEn("");
      setFr("");
      setAr("");
      setItems(defaultChecklist);
      setError(null);
    }
    onClose();
    restoreCatalogFocus(row?._id, "inspection-template");
  }
  async function reload() {
    if (
      !row ||
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setRevision(row.revision);
    setCode(row.code);
    setEn(row.name.en);
    setFr(row.name.fr);
    setAr(row.name.ar);
    setItems(row.items);
    setError(null);
  }
  function updateItem(
    index: number,
    update: Partial<Doc<"inspectionTemplates">["items"][number]>,
  ) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...update } : item)),
    );
  }
  function moveItem(index: number, direction: -1 | 1) {
    setItems((current) => {
      const copy = [...current];
      const item = copy[index];
      const neighbour = copy[index + direction];
      if (!item || !neighbour) return current;
      copy[index] = neighbour;
      copy[index + direction] = item;
      return copy;
    });
  }
  const requestKey = useOperationRequestKey(
    JSON.stringify({ id: row?._id, revision, code, en, fr, ar, items }),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        id: row?._id,
        expectedRevision: revision,
        requestKey,
        code,
        name: { en, fr, ar },
        items,
        active: true,
      });
      setOpen(false);
      onClose();
    } catch (cause) {
      setError(
        String(cause).includes("CONFLICT")
          ? m.conflict
          : String(cause).includes("CODE_TAKEN")
            ? m.catalogCodeTaken
            : String(cause).includes("LIMIT")
              ? m.catalogLimit
              : m.invalid,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="operations-catalog-form">
      {!open && (
        <Button
          id="inspection-template-add"
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" aria-hidden />
          {m.addTemplate}
        </Button>
      )}
      {open && (
        <form
          className="operations-form"
          onSubmit={(event) => void submit(event)}
        >
          <p className="operations-helper">{m.templateVersionHint}</p>
          <fieldset disabled={pending} className="operations-form">
            <CatalogLabels
              prefix="inspection-template"
              code={code}
              setCode={setCode}
              en={en}
              setEn={setEn}
              fr={fr}
              setFr={setFr}
              ar={ar}
              setAr={setAr}
              disabledCode={Boolean(row)}
            />
            {items.map((item, index) => (
              <fieldset key={index} className="operations-template-item">
                <legend>
                  {m.checklist} {index + 1}
                </legend>
                <CatalogLabels
                  prefix={`template-item-${index}`}
                  code={item.code}
                  setCode={(code) => updateItem(index, { code })}
                  en={item.labels.en}
                  setEn={(en) =>
                    updateItem(index, { labels: { ...item.labels, en } })
                  }
                  fr={item.labels.fr}
                  setFr={(fr) =>
                    updateItem(index, { labels: { ...item.labels, fr } })
                  }
                  ar={item.labels.ar}
                  setAr={(ar) =>
                    updateItem(index, { labels: { ...item.labels, ar } })
                  }
                />
                <Label className="operations-check">
                  <Checkbox
                    checked={item.safety}
                    onCheckedChange={(value) =>
                      updateItem(index, {
                        safety: value === true,
                        required: value === true || item.required,
                      })
                    }
                  />
                  {m.safety}
                </Label>
                <Label className="operations-check">
                  <Checkbox
                    checked={item.required}
                    disabled={item.safety}
                    onCheckedChange={(value) =>
                      updateItem(index, { required: value === true })
                    }
                  />
                  {m.required}
                </Label>
                <div className="operations-form-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={items.length <= 1}
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    {m.removeChecklistItem.replace("{item}", String(index + 1))}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                  >
                    {m.moveItemUp}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                  >
                    {m.moveItemDown}
                  </Button>
                </div>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={items.length >= 32}
              onClick={() =>
                setItems((current) => [
                  ...current,
                  {
                    code: "",
                    labels: { en: "", fr: "", ar: "" },
                    required: false,
                    safety: false,
                  },
                ])
              }
            >
              {m.addChecklistItem}
            </Button>
          </fieldset>
          {(error || stale) && (
            <p className="operations-feedback" role="alert">
              {error ?? m.conflict}
            </p>
          )}
          <div className="operations-form-actions">
            <Button disabled={pending || stale}>
              {row ? m.saveDraft : m.addTemplate}
            </Button>
            <Button
              type="button"
              variant="outline"
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
      )}
    </div>
  );
}

function VendorForm({
  agencyId,
  row,
  onClose,
  onEditing,
}: {
  agencyId: Id<"agencies">;
  row?: Doc<"maintenanceVendors">;
  onClose: () => void;
  onEditing: (open: boolean) => void;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  const save = useMutation(operationsApi.catalogs.saveVendor);
  const [open, setOpen] = useState(Boolean(row));
  useEffect(() => onEditing(open), [open, onEditing]);
  const [revision, setRevision] = useState(row?.revision ?? 0);
  const [name, setName] = useState(row?.name ?? "");
  const [phone, setPhone] = useState(row?.phone ?? "");
  const [email, setEmail] = useState(row?.email ?? "");
  const [address, setAddress] = useState(row?.address ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const dirty =
    JSON.stringify({ name, phone, email, address }) !==
    JSON.stringify({
      name: row?.name ?? "",
      phone: row?.phone ?? "",
      email: row?.email ?? "",
      address: row?.address ?? "",
    });
  const stale = Boolean(row && revision !== row.revision);
  useUnsavedChanges(open && dirty);
  async function close() {
    if (
      dirty &&
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setOpen(false);
    if (!row) {
      setName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setError(null);
    }
    onClose();
    restoreCatalogFocus(row?._id, "vendor");
  }
  async function reload() {
    if (
      !row ||
      !(await confirm(m.discardDraft, { actionLabel: m.discardChanges }))
    )
      return;
    setRevision(row.revision);
    setName(row.name);
    setPhone(row.phone);
    setEmail(row.email);
    setAddress(row.address);
    setError(null);
  }
  const requestKey = useOperationRequestKey(
    JSON.stringify({ id: row?._id, revision, name, phone, email, address }),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        id: row?._id,
        expectedRevision: revision,
        requestKey,
        name,
        phone,
        email,
        address,
        active: row?.active ?? true,
      });
      setOpen(false);
      onClose();
    } catch (cause) {
      setError(
        String(cause).includes("CONFLICT")
          ? m.conflict
          : String(cause).includes("LIMIT")
            ? m.catalogLimit
            : m.failed,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="operations-catalog-form">
      {!open && (
        <Button
          id="vendor-add"
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" aria-hidden />
          {m.addVendor}
        </Button>
      )}
      {open && (
        <form
          className="operations-form"
          onSubmit={(event) => void submit(event)}
        >
          <fieldset disabled={pending} className="operations-form">
            <Field>
              <Label htmlFor="vendor-name">{m.name}</Label>
              <Input
                id="vendor-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                required
              />
            </Field>
            <Field>
              <Label htmlFor="vendor-phone">{m.phone}</Label>
              <Input
                id="vendor-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={32}
              />
            </Field>
            <Field>
              <Label htmlFor="vendor-email">{m.email}</Label>
              <Input
                id="vendor-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
              />
            </Field>
            <Field>
              <Label htmlFor="vendor-address">{m.address}</Label>
              <Input
                id="vendor-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={500}
              />
            </Field>
          </fieldset>
          {(error || stale) && (
            <p className="operations-feedback" role="alert">
              {error ?? m.conflict}
            </p>
          )}
          <div className="operations-form-actions">
            <Button disabled={pending || stale}>
              {row ? m.saveDraft : m.addVendor}
            </Button>
            <Button
              type="button"
              variant="outline"
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
      )}
    </div>
  );
}

function CatalogLabels({
  prefix,
  code,
  setCode,
  en,
  setEn,
  fr,
  setFr,
  ar,
  setAr,
  disabledCode = false,
}: {
  prefix: string;
  code: string;
  setCode: (value: string) => void;
  en: string;
  setEn: (value: string) => void;
  fr: string;
  setFr: (value: string) => void;
  ar: string;
  setAr: (value: string) => void;
  disabledCode?: boolean;
}) {
  const {
    messages: { operations: m },
  } = useI18n();
  return (
    <>
      <Field>
        <Label htmlFor={`${prefix}-code`}>{m.code}</Label>
        <Input
          id={`${prefix}-code`}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={32}
          required
          disabled={disabledCode}
        />
      </Field>
      <Field>
        <Label htmlFor={`${prefix}-en`}>{m.labelEn}</Label>
        <Input
          id={`${prefix}-en`}
          value={en}
          onChange={(event) => setEn(event.target.value)}
          maxLength={160}
          required
        />
      </Field>
      <Field>
        <Label htmlFor={`${prefix}-fr`}>{m.labelFr}</Label>
        <Input
          id={`${prefix}-fr`}
          value={fr}
          onChange={(event) => setFr(event.target.value)}
          maxLength={160}
          required
        />
      </Field>
      <Field>
        <Label htmlFor={`${prefix}-ar`}>{m.labelAr}</Label>
        <Input
          id={`${prefix}-ar`}
          dir="rtl"
          value={ar}
          onChange={(event) => setAr(event.target.value)}
          maxLength={160}
          required
        />
      </Field>
    </>
  );
}
