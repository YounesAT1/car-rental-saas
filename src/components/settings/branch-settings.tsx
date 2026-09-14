"use client";
import { useConfirm } from "@/components/confirmation-provider";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MapPin, Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { BranchForm } from "./branch-form";
import { settingsError } from "./form-fields";

export type BranchRecord = FunctionReturnType<typeof api.branches.get>;

export function BranchSettings({
  agencyId,
  timezone,
  country,
  canManage,
}: {
  agencyId: Id<"agencies">;
  timezone: string;
  country?: string;
  canManage: boolean;
}) {
  const confirm = useConfirm();
  const {
    messages: { settings: m },
  } = useI18n();
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [editing, setEditing] = useState<Id<"branches"> | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const {
    results,
    status: loading,
    loadMore,
  } = usePaginatedQuery(
    api.branches.list,
    { agencyId, status },
    { initialNumItems: 12 },
  );
  const changeStatus = useMutation(api.branches.setStatus);
  async function toggle(branch: BranchRecord) {
    if (
      branch.status === "active" &&
      !(await confirm(m.archiveConfirm, {
        title: m.archive,
        actionLabel: m.archive,
        destructive: true,
      }))
    )
      return;
    setPending(true);
    setError(null);
    try {
      await changeStatus({
        agencyId,
        branchId: branch.id,
        expectedRevision: branch.revision,
        status: branch.status === "active" ? "archived" : "active",
      });
    } catch (cause) {
      setError(settingsError(cause, m));
    } finally {
      setPending(false);
    }
  }
  if (editing && canManage)
    return (
      <BranchEditor
        key={editing}
        agencyId={agencyId}
        branchId={editing}
        timezone={timezone}
        country={country}
        onClose={() => setEditing(null)}
      />
    );
  return (
    <div className="settings-form">
      <div className="settings-section-topline">
        <div>
          <h2>{m.branches}</h2>
          <p>{m.branchHint}</p>
        </div>
        {canManage && (
          <Button
            className="h-11 rounded-full"
            onClick={() => setEditing("new")}
          >
            <Plus className="size-4" aria-hidden />
            {m.addBranch}
          </Button>
        )}
      </div>
      <div className="flex gap-2" role="group" aria-label={m.branches}>
        {(["active", "archived"] as const).map((s) => (
          <Button
            key={s}
            variant={status === s ? "secondary" : "ghost"}
            aria-pressed={status === s}
            className="h-11 rounded-full px-5"
            onClick={() => {
              setStatus(s);
              setError(null);
            }}
          >
            {m[s]}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading === "LoadingFirstPage" ? (
        <WorkspaceLoading label={m.loading} variant="card" />
      ) : results.length === 0 ? (
        <Card className="settings-empty">
          <MapPin className="size-7 text-primary" aria-hidden />
          <h3>{status === "active" ? m.noBranches : m.noArchived}</h3>
          <p>{m.branchHint}</p>
          {canManage && status === "active" && (
            <Button
              variant="outline"
              className="h-11 shadow-none"
              onClick={() => setEditing("new")}
            >
              {m.addBranch}
            </Button>
          )}
        </Card>
      ) : (
        <div className="settings-branch-list">
          {results.map((branch) => (
            <Card className="settings-branch" key={branch.id}>
              <div className="settings-location-mark">
                <MapPin className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground tracking-wide">
                  <bdi>{branch.code}</bdi>
                </p>
                <h3 className="text-lg font-semibold wrap-break-word">
                  {branch.name}
                </h3>
                <p className="text-sm text-muted-foreground wrap-break-word">
                  {branch.address}, {branch.city}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  <bdi>{branch.timezone.replaceAll("_", " ")}</bdi>
                </p>
                <BranchDetails branch={branch} />
              </div>
              <div className="settings-branch-actions">
                {canManage && (
                  <>
                    {branch.status === "active" && (
                      <Button
                        variant="outline"
                        className="h-11 shadow-none"
                        onClick={() => setEditing(branch.id)}
                      >
                        {m.edit}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="h-11 text-muted-foreground"
                      disabled={pending}
                      onClick={() => void toggle(branch)}
                    >
                      {branch.status === "active" ? m.archive : m.restore}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {(loading === "CanLoadMore" || loading === "LoadingMore") && (
        <Button
          className="h-11 self-start"
          variant="outline"
          disabled={loading === "LoadingMore"}
          onClick={() => loadMore(12)}
        >
          {m.loadMore}
        </Button>
      )}
    </div>
  );
}

function BranchDetails({ branch }: { branch: BranchRecord }) {
  const {
    locale,
    messages: { settings: m },
  } = useI18n();
  const weekday = (day: number) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      timeZone: "UTC",
    }).format(Date.UTC(2024, 0, 7 + day));
  return (
    <Collapsible className="mt-3 text-sm">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="group min-h-11 w-full justify-between px-0 text-primary"
        >
          {m.hours}
          <ChevronDown
            aria-hidden
            className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <dl className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <div className="flex flex-wrap justify-between gap-2" key={day}>
              <dt className="text-muted-foreground">{weekday(day)}</dt>
              <dd>
                <bdi>
                  {branch.hours
                    .find((d) => d.day === day)
                    ?.intervals.map((i) => `${i.opens} – ${i.closes}`)
                    .join(" / ") || m.closed}
                </bdi>
              </dd>
            </div>
          ))}
        </dl>
        {branch.closures.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium">{m.closures}</h4>
            {branch.closures.map((c) => (
              <p
                key={c.date}
                className="mt-2 text-muted-foreground wrap-anywhere"
              >
                <bdi>{c.date}</bdi>
                {c.reason && ` · ${c.reason}`}
              </p>
            ))}
          </div>
        )}
        {(branch.phone || branch.contactEmail) && (
          <p className="mt-4 wrap-anywhere">
            <bdi>{branch.phone}</bdi>
            <br />
            <bdi>{branch.contactEmail}</bdi>
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function BranchEditor({
  agencyId,
  branchId,
  timezone,
  country,
  onClose,
}: {
  agencyId: Id<"agencies">;
  branchId: Id<"branches"> | "new";
  timezone: string;
  country?: string;
  onClose: () => void;
}) {
  const {
    messages: { settings: m },
  } = useI18n();
  const branch = useQuery(
    api.branches.get,
    branchId === "new" ? "skip" : { agencyId, branchId },
  );
  if (branchId !== "new" && !branch)
    return <WorkspaceLoading label={m.loading} variant="card" />;
  if (branch?.status === "archived")
    return (
      <Card className="settings-card">
        <p role="status">{m.errors.archived}</p>
        <Button variant="outline" className="mt-4 h-11" onClick={onClose}>
          {m.cancel}
        </Button>
      </Card>
    );
  return (
    <BranchForm
      agencyId={agencyId}
      branch={branch}
      timezone={timezone}
      country={country}
      onClose={onClose}
    />
  );
}
