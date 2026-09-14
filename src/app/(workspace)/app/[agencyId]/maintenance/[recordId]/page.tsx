import { MaintenanceDetail } from "@/components/operations/maintenance-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ agencyId: string; recordId: string }>;
}) {
  const { agencyId, recordId } = await params;
  return <MaintenanceDetail agencyId={agencyId} recordId={recordId} />;
}
