import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { InvitationAccept } from "@/components/invitation-accept";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { getI18n } from "@/i18n/server";
import { invitationReturnPath, signInPath } from "@/lib/auth-redirect";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) redirect(signInPath(invitationReturnPath(token)));
  const { messages } = await getI18n();
  return (
    <section className="workspace-page">
      <Suspense
        fallback={
          <WorkspaceLoading
            label={messages.common.workspace.acceptingInvitation}
            variant="card"
          />
        }
      >
        <InvitationAccept />
      </Suspense>
    </section>
  );
}
