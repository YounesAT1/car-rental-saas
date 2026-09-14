import { OperationsSettings } from "@/components/operations/operations-settings";

export default async function Page({
  params,
}: {
  params: Promise<{ agencyId: string }>;
}) {
  const { agencyId } = await params;
  return <OperationsSettings agencyId={agencyId} />;
}
