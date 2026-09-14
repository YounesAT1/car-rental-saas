import { OperationsPage } from "@/components/operations/operations-page";

export default async function Page({
  params,
}: {
  params: Promise<{ agencyId: string }>;
}) {
  const { agencyId } = await params;
  return <OperationsPage agencyId={agencyId} section="overview" />;
}
