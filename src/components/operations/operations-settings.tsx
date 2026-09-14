"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, FileCheck2, Plus, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { useI18n } from "@/i18n/client";
import { localizedLabel } from "@/lib/fleet";
import { operationsApi } from "@/lib/operations-api";

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
  const documentTypes = useQuery(
    operationsApi.catalogs.documentTypes,
    canReadDocuments ? { agencyId: aid } : "skip",
  );
  const templates = useQuery(
    operationsApi.catalogs.templates,
    canReadInspections ? { agencyId: aid } : "skip",
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
            }))}
          >
            {workspace.permissions.includes("document.vehicle.manage") && (
              <DocumentTypeForm agencyId={aid} />
            )}
          </CatalogCard>
        )}
        {canReadInspections && (
          <CatalogCard
            icon={ShieldCheck}
            title={m.templates}
            empty={m.noTemplates}
            rows={(templates ?? []).map((item) => ({
              id: item._id,
              title: localizedLabel(item.name, locale),
              meta: `${item.code} · v${item.version} · ${item.items.length} ${m.checklist}`,
            }))}
          >
            {workspace.permissions.includes("inspection.manage") && (
              <TemplateForm agencyId={aid} />
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
            }))}
          >
            {workspace.permissions.includes("maintenance.manage") && (
              <VendorForm agencyId={aid} />
            )}
          </CatalogCard>
        )}
      </div>
    </section>
  );
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
  rows: Array<{ id: string; title: string; meta: string }>;
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
            <div key={row.id}>
              <strong>{row.title}</strong>
              <span>{row.meta}</span>
            </div>
          ))}
        </div>
      )}
      {children}
    </Card>
  );
}

function DocumentTypeForm({ agencyId }: { agencyId: Id<"agencies"> }) {
  const {
    messages: { operations: m },
  } = useI18n();
  const save = useMutation(operationsApi.catalogs.saveDocumentType);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [en, setEn] = useState("");
  const [fr, setFr] = useState("");
  const [ar, setAr] = useState("");
  const [required, setRequired] = useState(false);
  const [expiry, setExpiry] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        expectedRevision: 0,
        code,
        labels: { en, fr, ar },
        required,
        expiryRequired: expiry,
        active: true,
      });
      setCode("");
      setEn("");
      setFr("");
      setAr("");
      setOpen(false);
    } catch {
      setError(m.failed);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="operations-catalog-form">
      <Button type="button" variant="outline" onClick={() => setOpen(!open)}>
        <Plus className="size-4" aria-hidden />
        {m.addDocumentType}
      </Button>
      {open && (
        <form
          className="operations-form"
          onSubmit={(event) => void submit(event)}
        >
          <CatalogLabels
            prefix="document-type"
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
          {error && (
            <p className="operations-feedback" role="alert">
              {error}
            </p>
          )}
          <Button disabled={pending}>{m.addDocumentType}</Button>
        </form>
      )}
    </div>
  );
}

function TemplateForm({ agencyId }: { agencyId: Id<"agencies"> }) {
  const {
    messages: { operations: m },
  } = useI18n();
  const save = useMutation(operationsApi.catalogs.saveTemplate);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [en, setEn] = useState("");
  const [fr, setFr] = useState("");
  const [ar, setAr] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const items = [
      ["EXTERIOR", "Exterior", "Extérieur", "الهيكل الخارجي", false],
      ["TYRES", "Tyres", "Pneus", "الإطارات", true],
      ["LIGHTS", "Lights", "Feux", "الأضواء", true],
      ["FLUIDS", "Fluids", "Fluides", "السوائل", true],
      ["CLEANLINESS", "Cleanliness", "Propreté", "النظافة", false],
      ["EQUIPMENT", "Equipment", "Équipement", "التجهيزات", false],
    ] as const;
    try {
      await save({
        agencyId,
        expectedRevision: 0,
        code,
        name: { en, fr, ar },
        items: items.map(([itemCode, itemEn, itemFr, itemAr, safety]) => ({
          code: itemCode,
          labels: { en: itemEn, fr: itemFr, ar: itemAr },
          safety,
          required: true,
        })),
        active: true,
      });
      setOpen(false);
    } catch {
      setError(m.failed);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="operations-catalog-form">
      <Button type="button" variant="outline" onClick={() => setOpen(!open)}>
        <Plus className="size-4" aria-hidden />
        {m.addTemplate}
      </Button>
      {open && (
        <form
          className="operations-form"
          onSubmit={(event) => void submit(event)}
        >
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
          />
          {error && (
            <p className="operations-feedback" role="alert">
              {error}
            </p>
          )}
          <Button disabled={pending}>{m.addTemplate}</Button>
        </form>
      )}
    </div>
  );
}

function VendorForm({ agencyId }: { agencyId: Id<"agencies"> }) {
  const {
    messages: { operations: m },
  } = useI18n();
  const save = useMutation(operationsApi.catalogs.saveVendor);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await save({
        agencyId,
        expectedRevision: 0,
        name,
        phone,
        email,
        address,
        active: true,
      });
      setOpen(false);
    } catch {
      setError(m.failed);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="operations-catalog-form">
      <Button type="button" variant="outline" onClick={() => setOpen(!open)}>
        <Plus className="size-4" aria-hidden />
        {m.addVendor}
      </Button>
      {open && (
        <form
          className="operations-form"
          onSubmit={(event) => void submit(event)}
        >
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
          {error && (
            <p className="operations-feedback" role="alert">
              {error}
            </p>
          )}
          <Button disabled={pending}>{m.addVendor}</Button>
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
