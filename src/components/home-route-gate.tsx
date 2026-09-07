"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

export function HomeRouteGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const agencies = useQuery(
    api.identity.listAgencies,
    isSignedIn ? {} : "skip",
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
    <div className="home-route-gate" aria-busy="true">
      <span className="sr-only">Preparing your workspace…</span>
    </div>
  );
}
