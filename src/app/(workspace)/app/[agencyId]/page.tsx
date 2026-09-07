import { WorkspaceDashboard } from "@/components/workspace-dashboard";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ agencyId: string }>;
}) {
  const { agencyId } = await params;
  return (
    <section className="workspace-page workspace-page-dashboard">
      <WorkspaceDashboard agencyId={agencyId} />
    </section>
  );
}
