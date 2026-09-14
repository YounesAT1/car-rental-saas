import { VehicleOperations } from "@/components/operations/vehicle-operations";

export default async function Page({
  params,
}: {
  params: Promise<{ agencyId: string; vehicleId: string }>;
}) {
  const { agencyId, vehicleId } = await params;
  return <VehicleOperations agencyId={agencyId} vehicleId={vehicleId} />;
}
