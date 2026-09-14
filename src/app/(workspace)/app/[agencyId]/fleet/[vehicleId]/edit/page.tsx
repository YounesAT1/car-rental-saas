import { FleetPage } from "@/components/fleet/fleet-page";
export default async function Page({
  params,
}: {
  params: Promise<{ agencyId: string; vehicleId: string }>;
}) {
  const { agencyId, vehicleId } = await params;
  return <FleetPage agencyId={agencyId} section="edit" vehicleId={vehicleId} />;
}
