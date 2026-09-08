"use client";

import { SignOutButton, useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api } from "../../convex/_generated/api";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { WorkspaceLoading } from "@/components/workspace-loading";

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function IdentitySync({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const { locale, messages } = useI18n();
  const ensureCurrentUser = useMutation(api.identity.ensureCurrentUser);
  const user = useQuery(
    api.identity.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const identityKey = `${userId}:${sessionId}:${locale}:${retry}`;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isAuthenticated) return;
    let current = true;
    void ensureCurrentUser({ locale }).then(
      () => {
        if (current) setSyncedFor(identityKey);
      },
      () => {
        if (current) setFailedFor(identityKey);
      },
    );
    return () => {
      current = false;
    };
  }, [
    ensureCurrentUser,
    isLoaded,
    isSignedIn,
    isAuthenticated,
    identityKey,
    locale,
  ]);

  if (!mounted || !isLoaded || !isSignedIn) return children;
  if (isAuthenticated && syncedFor === identityKey && user?.status === "active")
    return children;

  const failed = failedFor === identityKey || user?.status === "disabled";
  if (!failed) {
    return (
      <WorkspaceLoading label={messages.workspace.syncing} variant="page" />
    );
  }

  return (
    <section className="workspace-message-card" aria-busy="false">
      <p role={failed ? "alert" : "status"}>
        {user?.status === "disabled"
          ? messages.workspace.accountDisabled
          : failed
            ? messages.workspace.syncError
            : messages.workspace.syncing}
      </p>
      {failed && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => setRetry((value) => value + 1)}>
            {messages.recovery.retry}
          </Button>
          <SignOutButton>
            <Button variant="outline">{messages.auth.signOut}</Button>
          </SignOutButton>
        </div>
      )}
    </section>
  );
}
