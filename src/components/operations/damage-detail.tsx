"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { useI18n } from "@/i18n/client";
import { operationsApi } from "@/lib/operations-api";
import { PrivateEvidence } from "./private-evidence";

const nextStatus: Record<
  Doc<"damageReports">["status"],
  Doc<"damageReports">["status"] | null
> = {
  reported: "reviewing",
  reviewing: "approved",
  approved: "repairing",
  repairing: "resolved",
  resolved: null,
};

export function DamageDetail({
  agencyId,
  damageId,
}: {
  agencyId: string;
  damageId: string;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const aid = agencyId as Id<"agencies">;
  const id = damageId as Id<"damageReports">;
  const workspace = useQuery(api.identity.getWorkspace, { agencyId: aid });
  const record = useQuery(operationsApi.damage.get, { agencyId: aid, id });
  const transition = useMutation(operationsApi.damage.transition);
  const [resolution, setResolution] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (workspace === undefined || record === undefined)
    return (
      <section className="workspace-page operations-page">
        <WorkspaceLoading label={m.loading} variant="card" />
      </section>
    );
  if (!workspace || !record)
    return (
      <section className="workspace-page operations-page">
        <p role="status">{m.denied}</p>
      </section>
    );
  const damage = record;
  const canManage = workspace.permissions.includes("damage.manage");
  const next = nextStatus[damage.status];
  const statusText = (status: Doc<"damageReports">["status"]) =>
    status === "reported"
      ? m.reported
      : status === "reviewing"
        ? m.reviewing
        : status === "approved"
          ? m.approved
          : status === "repairing"
            ? m.repairing
            : m.resolved;

  async function advance() {
    if (!next) return;
    setPending(true);
    setError(null);
    try {
      await transition({
        agencyId: aid,
        id,
        expectedRevision: damage.revision,
        status: next,
        resolution: next === "resolved" ? resolution : "",
        requestKey: `damage-${id}-${damage.revision}-${next}`,
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
        href={`/app/${agencyId}/fleet/${record.vehicleId}/operations`}
        className="workspace-backlink inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft className="directional-icon size-4" aria-hidden />
        {m.vehicleOperations}
      </Link>
      <header className="settings-heading operations-heading">
        <p className="eyebrow">{m.damages}</p>
        <h1>{record.location}</h1>
        <p>
          {statusText(record.status)} ·{" "}
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
            record.recordedAt,
          )}
        </p>
      </header>
      <Card className="operations-history-card">
        <div className="operations-catalog-title">
          <ShieldAlert className="size-5" aria-hidden />
          <h2>{record.severity === "blocking" ? m.blocked : m.needsReview}</h2>
        </div>
        <p className="whitespace-pre-wrap">{record.description}</p>
        {record.resolution && (
          <p className="text-muted-foreground">{record.resolution}</p>
        )}
        {record.estimateMinor !== null && (
          <strong>
            {new Intl.NumberFormat(locale, {
              style: "currency",
              currency: record.currency,
            }).format(
              record.estimateMinor / (record.currency === "TND" ? 1000 : 100),
            )}
          </strong>
        )}
      </Card>
      <PrivateEvidence
        agencyId={aid}
        vehicleId={record.vehicleId}
        owner={{ kind: "damage", id }}
        expectedRevision={record.revision}
        canManage={canManage && record.status !== "resolved"}
      />
      {canManage && next && (
        <Card className="operations-form-card">
          <div className="settings-card-heading">
            <h2>{statusText(next)}</h2>
          </div>
          {next === "resolved" && (
            <Field>
              <Label htmlFor="damage-resolution">{m.reason}</Label>
              <Textarea
                id="damage-resolution"
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                maxLength={500}
                required
              />
            </Field>
          )}
          {error && (
            <p className="operations-feedback" role="alert">
              {error}
            </p>
          )}
          <Button
            className="self-start"
            disabled={pending || (next === "resolved" && !resolution.trim())}
            onClick={() => void advance()}
          >
            {statusText(next)}
            <ArrowRight className="directional-icon size-4" aria-hidden />
          </Button>
        </Card>
      )}
    </section>
  );
}
