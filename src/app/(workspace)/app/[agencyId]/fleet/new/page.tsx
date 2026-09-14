import { FleetPage } from "@/components/fleet/fleet-page";
export default async function Page({
  params,
}: {
  params: Promise<{ agencyId: string }>;
}) {
  const { agencyId } = await params;
  return <FleetPage agencyId={agencyId} section="new" />;
}
