"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { useI18n } from "@/i18n/client";
import { WorkspaceLoading } from "@/components/workspace-loading";

export function HomeRouteGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const { messages } = useI18n();
  const router = useRouter();
  const agencies = useQuery(
    api.identity.listAgencies,
    isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn || agencies === undefined) return;
    const destination = agencies[0]
      ? `/app/${agencies[0].agency.id}`
      : "/onboarding";
    router.replace(destination);
  }, [agencies, isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  return (
    <WorkspaceLoading
      className="home-route-gate"
      label={messages.workspace.syncing}
      variant="page"
    />
  );
}
