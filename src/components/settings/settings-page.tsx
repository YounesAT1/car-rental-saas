"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { ArrowLeft, Building2, MapPin, ScrollText } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { Card } from "@/components/ui/card";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { BusinessSettings } from "./business-form";
import { BranchSettings } from "./branch-settings";
import { PolicySettings } from "./policy-settings";

export type SettingsSection = "business" | "branches" | "policies";
const sections = [
  { key: "business", icon: Building2, path: "" },
  { key: "branches", icon: MapPin, path: "/branches" },
  { key: "policies", icon: ScrollText, path: "/policies" },
] as const;

export function SettingsPage({
  agencyId,
  section,
}: {
  agencyId: string;
  section: SettingsSection;
}) {
  const {
    messages: { settings: m },
  } = useI18n();
  const id = agencyId as Id<"agencies">;
  const workspace = useQuery(api.identity.getWorkspace, { agencyId: id });
  if (workspace === undefined)
    return (
      <section className="workspace-page">
        <WorkspaceLoading label={m.loading} variant="card" />
      </section>
    );
  const canManage = workspace?.permissions.includes("agency.settings") ?? false;
  const denied = !workspace || (section === "business" && !canManage);
  return (
    <section className="workspace-page settings-page">
      <Link
        href={`/app/${agencyId}`}
        className="workspace-backlink inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft className="directional-icon size-4" aria-hidden />
        {m.back}
      </Link>
      <header className="settings-heading">
        <p className="eyebrow">{workspace?.agency.name ?? m.title}</p>
        <h1>{m.title}</h1>
        <p>{m.description}</p>
      </header>
      <div className="settings-layout">
        <nav className="settings-navigation" aria-label={m.title}>
          {sections
            .filter((s) => s.key !== "business" || canManage)
            .map(({ key, path, icon: Icon }) => (
              <Link
                key={key}
                href={`/app/${agencyId}/settings${path}`}
                aria-current={section === key ? "page" : undefined}
              >
                <Icon className="size-4" aria-hidden />
                {m[key]}
              </Link>
            ))}
        </nav>
        <div className="settings-content" key={`${agencyId}:${section}`}>
          {denied ? (
            <Card className="settings-card">
              <p role="status">{m.accessDenied}</p>
            </Card>
          ) : (
            <>
              {!canManage && <p className="settings-notice">{m.readOnly}</p>}
              {section === "business" && <BusinessSettings agencyId={id} />}
              {section === "branches" && (
                <BranchSettings
                  agencyId={id}
                  country={workspace.agency.country}
                  timezone={workspace.agency.timezone}
                  canManage={workspace.permissions.includes("branch.manage")}
                />
              )}
              {section === "policies" && (
                <PolicySettings
                  agencyId={id}
                  canManage={canManage}
                  timezone={workspace.agency.timezone}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
