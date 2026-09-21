import { MaintenanceSchedules } from "@/components/operations/maintenance-schedules";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ agencyId: string }>;
  searchParams: Promise<{ vehicleId?: string | string[] }>;
}) {
  const [{ agencyId }, { vehicleId }] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <MaintenanceSchedules
      agencyId={agencyId}
      requestedVehicleId={typeof vehicleId === "string" ? vehicleId : undefined}
    />
  );
}
