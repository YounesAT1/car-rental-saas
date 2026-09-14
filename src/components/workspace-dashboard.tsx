"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { InviteMemberForm } from "@/components/invite-member-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, ArrowRight, CarFront, Gauge } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkspaceLoading } from "@/components/workspace-loading";

export function WorkspaceDashboard({ agencyId }: { agencyId: string }) {
  const { messages } = useI18n();
  const router = useRouter();
  const workspace = useQuery(api.identity.getWorkspace, {
    agencyId: agencyId as Id<"agencies">,
  });
  const agencies = useQuery(api.identity.listAgencies);
  const selectAgency = useMutation(api.identity.selectAgency);

  useEffect(() => {
    if (workspace === null) router.replace("/agencies/select");
  }, [router, workspace]);

  if (workspace === undefined || workspace === null) {
    return (
      <WorkspaceLoading
        label={messages.workspace.workspaceLoading}
        variant="card"
      />
    );
  }

  async function switchAgency(nextAgencyId: string) {
    await selectAgency({ agencyId: nextAgencyId as Id<"agencies"> });
    router.push(`/app/${nextAgencyId}`);
  }

  return (
    <div className="workspace-dashboard">
      <div className="workspace-topline">
        <Link href="/onboarding" className="workspace-backlink">
          ← {messages.workspace.backToAgencies}
        </Link>
        {agencies && agencies.length > 1 && (
          <Label className="agency-switcher">
            <span className="sr-only">{messages.workspace.selectTitle}</span>
            <Select
              value={workspace.agency.id}
              onValueChange={(value) => void switchAgency(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agencies.map(({ agency }) => (
                  <SelectItem value={agency.id} key={agency.id}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
        )}
      </div>
      <Card className="workspace-welcome" aria-labelledby="workspace-title">
        <p className="eyebrow">{workspace.agency.slug}</p>
        <h1 id="workspace-title">{messages.workspace.workspaceTitle}</h1>
        <p>{messages.workspace.workspaceDescription}</p>
        <div className="workspace-meta">
          <span>
            <small>{messages.workspace.role}</small>
            <strong>{workspace.membership.roleKey.replaceAll("_", " ")}</strong>
          </span>
          <span>
            <small>{messages.workspace.signedInAs}</small>
            <strong>
              {workspace.user.email ?? workspace.user.name ?? "—"}
            </strong>
          </span>
        </div>
      </Card>
      <Card className="workspace-permissions">
        <div>
          <p className="eyebrow">{messages.platform}</p>
          <h2>
            {messages.workspace.permissionsActive.replace(
              "{count}",
              String(workspace.permissions.length),
            )}
          </h2>
        </div>
        <p>{messages.workspace.modulesPreview}</p>
      </Card>
      <Card className="settings-workspace-entry">
        <div className="settings-location-mark">
          <Building2 className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2>{messages.settings.setup}</h2>
          <p>{messages.settings.setupDescription}</p>
        </div>
        <Button
          asChild
          variant="outline"
          className="h-11 shadow-none rounded-full"
        >
          <Link
            href={`/app/${agencyId}/settings${workspace.permissions.includes("agency.settings") ? "" : "/branches"}`}
          >
            {messages.settings.open}
            <ArrowRight className="directional-icon size-4" aria-hidden />
          </Link>
        </Button>
      </Card>
      {workspace.permissions.includes("vehicle.read") && (
        <Card className="settings-workspace-entry">
          <div className="settings-location-mark">
            <CarFront className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2>{messages.fleet.title}</h2>
            <p>{messages.fleet.description}</p>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-11 shadow-none rounded-full"
          >
            <Link href={`/app/${agencyId}/fleet`}>
              {messages.fleet.open}
              <ArrowRight className="directional-icon size-4" aria-hidden />
            </Link>
          </Button>
        </Card>
      )}
      {(workspace.permissions.includes("maintenance.read") ||
        workspace.permissions.includes("inspection.read") ||
        workspace.permissions.includes("task.read")) && (
        <Card className="settings-workspace-entry">
          <div className="settings-location-mark">
            <Gauge className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2>{messages.operations.title}</h2>
            <p>{messages.operations.description}</p>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-11 shadow-none rounded-full"
          >
            <Link href={`/app/${agencyId}/operations`}>
              {messages.operations.open}
              <ArrowRight className="directional-icon size-4" aria-hidden />
            </Link>
          </Button>
        </Card>
      )}
      {workspace.permissions.includes("employee.manage") && (
        <InviteMemberForm agencyId={workspace.agency.id} />
      )}
    </div>
  );
}
