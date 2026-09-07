import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AgencySelector } from "@/components/agency-selector";
import { getI18n } from "@/i18n/server";

export default async function OnboardingPage() {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) redirect("/sign-in?redirect_url=%2Fonboarding");
  const { messages } = await getI18n();

  return (
    <section className="workspace-page" aria-labelledby="onboarding-title">
      <div className="workspace-page-intro">
        <p className="eyebrow">{messages.common.auth.continue}</p>
        <h1 id="onboarding-title">{messages.common.workspace.selectTitle}</h1>
        <p>{messages.common.workspace.selectDescription}</p>
      </div>
      <AgencySelector />
    </section>
  );
}
