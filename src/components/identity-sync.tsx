"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { useI18n } from "@/i18n/client";

export function IdentitySync() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { locale, messages } = useI18n();
  const ensureCurrentUser = useMutation(api.identity.ensureCurrentUser);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    void ensureCurrentUser({ locale }).catch(() => undefined);
  }, [ensureCurrentUser, isLoaded, isSignedIn, locale, user]);

  return (
    <span className="sr-only" role="status" aria-live="polite">
      {isSignedIn && !isLoaded ? messages.workspace.syncing : ""}
    </span>
  );
}
