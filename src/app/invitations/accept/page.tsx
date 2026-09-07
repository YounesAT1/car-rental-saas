import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { InvitationAccept } from "@/components/invitation-accept";

export default async function AcceptInvitationPage() {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated)
    redirect("/sign-in?redirect_url=%2Finvitations%2Faccept");
  return (
    <section className="workspace-page">
      <Suspense
        fallback={
          <div className="workspace-message">Accepting invitation…</div>
        }
      >
        <InvitationAccept />
      </Suspense>
    </section>
  );
}
