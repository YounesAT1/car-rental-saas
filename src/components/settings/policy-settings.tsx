"use client";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ScrollText, Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { currencyDecimals } from "@/lib/agency-settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { PolicyForm } from "./policy-form";

export type CurrentPolicy = FunctionReturnType<
  typeof api.agencySettings.getCurrentPolicy
>;
export type PolicyRecord = NonNullable<CurrentPolicy["policy"]>;

export function PolicySettings({
  agencyId,
  canManage,
  timezone,
}: {
  agencyId: Id<"agencies">;
  canManage: boolean;
  timezone: string;
}) {
  const {
    locale,
    messages: { settings: m },
  } = useI18n();
  const current = useQuery(api.agencySettings.getCurrentPolicy, { agencyId });
  const [editing, setEditing] = useState(false);
  const { results, status, loadMore } = usePaginatedQuery(
    api.agencySettings.listPolicyHistory,
    { agencyId },
    { initialNumItems: 6 },
  );
  if (!current) return <WorkspaceLoading label={m.loading} variant="card" />;
  if (editing && canManage)
    return (
      <PolicyForm
        agencyId={agencyId}
        current={current}
        onClose={() => setEditing(false)}
      />
    );
  return (
    <div className="settings-form">
      <div className="settings-section-topline">
        <div>
          <h2>{m.policies}</h2>
          <p>{m.policyHint}</p>
        </div>
        {canManage && (
          <Button
            className="h-11 rounded-full"
            onClick={() => setEditing(true)}
          >
            <Plus className="size-4" aria-hidden />
            {m.newVersion}
          </Button>
        )}
      </div>
      {!current.policy ? (
        <Card className="settings-empty">
          <ScrollText className="size-7 text-primary" aria-hidden />
          <h3>{m.noPolicy}</h3>
          <p>{m.policyHint}</p>
          {canManage && (
            <Button
              variant="outline"
              className="min-h-11 shadow-none"
              onClick={() => setEditing(true)}
            >
              {m.newVersion}
            </Button>
          )}
        </Card>
      ) : (
        <Card className="settings-card">
          <div className="settings-card-heading">
            <h3>
              {m.version.replace("{version}", String(current.policy.version))}
            </h3>
            <p>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: timezone,
              }).format(current.policy.effectiveAt)}{" "}
              · {timezone.replaceAll("_", " ")}
            </p>
          </div>
          <PolicyDetails policy={current.policy} />
        </Card>
      )}
      {results.length > 0 && (
        <Card className="settings-card">
          <div className="settings-card-heading">
            <h3>{m.history}</h3>
          </div>
          {results.map((p) => (
            <Collapsible key={p.id} className="settings-policy-history">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="settings-policy-trigger group w-full justify-between rounded-none text-start whitespace-normal"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      {m.version.replace("{version}", String(p.version))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeZone: timezone,
                      }).format(p.effectiveAt)}{" "}
                      · {p.currency}
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 pb-6">
                <PolicyDetails policy={p} />
              </CollapsibleContent>
            </Collapsible>
          ))}
          {(status === "CanLoadMore" || status === "LoadingMore") && (
            <Button
              variant="ghost"
              className="mt-4 h-11"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(6)}
            >
              {m.loadMore}
            </Button>
          )}
        </Card>
      )}
      <p className="settings-notice">{m.configurationOnly}</p>
    </div>
  );
}

function PolicyDetails({ policy }: { policy: PolicyRecord }) {
  const {
    locale,
    messages: { settings: m },
  } = useI18n();
  const { terms, ...p } = policy;
  const values = [
    [m.minimumDriverAge, p.minimumDriverAge],
    [m.minimumLicenseYears, p.minimumLicenseYears],
    [m.maximumRentalDays, p.maximumRentalDays],
    [m.bookingHorizonDays, p.bookingHorizonDays],
    [m.preparationMinutes, p.preparationMinutes],
    [m.graceMinutes, p.graceMinutes],
    [m.includedKmPerDay, p.includedKmPerDay],
    [
      m.fuelPolicy,
      p.fuelPolicy === "full_to_full" ? m.fullToFull : m.sameToSame,
    ],
    [
      m.deposit.replace("{currency}", p.currency),
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: p.currency,
      }).format(p.depositAmountMinor / 10 ** currencyDecimals(p.currency)),
    ],
    [m.freeCancellationHours, p.freeCancellationHours],
  ];
  return (
    <div className="space-y-6">
      <dl className="settings-policy-values">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {typeof value === "number"
                ? new Intl.NumberFormat(locale).format(value)
                : value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="settings-policy-terms">
        <h4>{m.terms}</h4>
        <p dir={locale === "ar" ? "rtl" : "ltr"}>
          {terms[locale] || m.noTranslation}
        </p>
      </div>
    </div>
  );
}
