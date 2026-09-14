"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, CarFront, Gauge, Shapes } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { FleetList } from "./fleet-list";
import { FleetCatalogs } from "./catalogs";
import { VehicleEditor } from "./vehicle-form";
import { VehicleDetail } from "./vehicle-detail";

export function FleetPage({
  agencyId,
  section = "list",
  vehicleId,
}: {
  agencyId: string;
  section?: "list" | "catalogs" | "new" | "detail" | "edit";
  vehicleId?: string;
}) {
  const {
    messages: { fleet: m, settings: s, operations: o },
  } = useI18n();
  const id = agencyId as Id<"agencies">;
  const workspace = useQuery(api.identity.getWorkspace, { agencyId: id });
  if (workspace === undefined)
    return (
      <section className="workspace-page">
        <WorkspaceLoading label={m.loading} variant="card" />
      </section>
    );
  const permissions = workspace?.permissions ?? [];
  const allowed = permissions.includes("vehicle.read");
  const canEdit = permissions.includes("vehicle.update");
  return (
    <section className="workspace-page fleet-page">
      <Link
        href={
          section === "list" ? `/app/${agencyId}` : `/app/${agencyId}/fleet`
        }
        className="workspace-backlink inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft className="directional-icon size-4" aria-hidden />
        {section === "list" ? s.back : m.back}
      </Link>
      <header className="settings-heading">
        <p className="eyebrow">{workspace?.agency.name ?? m.title}</p>
        <h1>{m.title}</h1>
        <p>{m.description}</p>
      </header>
      <nav className="fleet-nav" aria-label={m.title}>
        <Link
          href={`/app/${agencyId}/fleet`}
          aria-current={section !== "catalogs" ? "page" : undefined}
        >
          <CarFront aria-hidden className="size-4" />
          {m.vehicles}
        </Link>
        <Link
          href={`/app/${agencyId}/fleet/catalogs`}
          aria-current={section === "catalogs" ? "page" : undefined}
        >
          <Shapes aria-hidden className="size-4" />
          {m.catalogs}
        </Link>
        {(permissions.includes("maintenance.read") ||
          permissions.includes("inspection.read") ||
          permissions.includes("task.read")) && (
          <Link href={`/app/${agencyId}/operations`}>
            <Gauge aria-hidden className="size-4" />
            {o.title}
          </Link>
        )}
      </nav>
      <div key={`${agencyId}:${section}:${vehicleId ?? ""}`}>
        {!allowed ? (
          <p role="status" className="fleet-empty">
            {m.denied}
          </p>
        ) : (
          <>
            {section === "list" && (
              <FleetList
                agencyId={id}
                canCreate={permissions.includes("vehicle.create")}
              />
            )}
            {section === "catalogs" && (
              <FleetCatalogs agencyId={id} canManage={canEdit} />
            )}
            {(section === "new" || section === "edit") &&
              ((
                section === "new"
                  ? permissions.includes("vehicle.create")
                  : canEdit
              ) ? (
                <VehicleEditor
                  agencyId={id}
                  vehicleId={vehicleId as Id<"vehicles"> | undefined}
                />
              ) : (
                <p role="status">{m.denied}</p>
              ))}
            {section === "detail" && vehicleId && (
              <VehicleDetail
                agencyId={id}
                vehicleId={vehicleId as Id<"vehicles">}
                permissions={permissions}
                currency={workspace!.agency.currency}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
