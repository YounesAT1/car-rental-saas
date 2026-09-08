"use client";

import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { WorkspaceLoading } from "@/components/workspace-loading";

export function InvitationAccept() {
  const params = useSearchParams();
  const router = useRouter();
  const { messages } = useI18n();
  const acceptInvitation = useMutation(api.identity.acceptInvitation);
  const token = params.get("token");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) {
      return;
    }
    let current = true;
    void acceptInvitation({ token })
      .then((workspace) => {
        if (current) router.replace(`/app/${workspace.agency.id}`);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [acceptInvitation, router, token, attempt]);

  const error = !token || failed;
  if (!error) {
    return (
      <WorkspaceLoading
        label={messages.workspace.acceptingInvitation}
        variant="card"
      />
    );
  }

  return (
    <div className="workspace-message-card">
      <p role={error ? "alert" : "status"}>
        {error
          ? messages.workspace.invitationError
          : messages.workspace.acceptingInvitation}
      </p>
      {failed && (
        <Button
          className="mt-4"
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          {messages.recovery.retry}
        </Button>
      )}
    </div>
  );
}
