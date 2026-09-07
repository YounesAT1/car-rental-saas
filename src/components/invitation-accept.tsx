"use client";

import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

export function InvitationAccept() {
  const params = useSearchParams();
  const router = useRouter();
  const acceptInvitation = useMutation(api.identity.acceptInvitation);
  const token = params.get("token");
  const [status, setStatus] = useState(token ? "accepting" : "missing");

  useEffect(() => {
    if (!token) {
      return;
    }
    void acceptInvitation({ token })
      .then((workspace) => router.replace(`/app/${workspace.agency.id}`))
      .catch((error: unknown) => {
        setStatus(
          error instanceof Error ? error.message : "INVITATION_INVALID",
        );
      });
  }, [acceptInvitation, router, token]);

  return (
    <div
      className="workspace-message"
      role={status === "accepting" ? "status" : "alert"}
    >
      {status === "accepting"
        ? "Accepting invitation…"
        : `Invitation could not be accepted: ${status}`}
    </div>
  );
}
