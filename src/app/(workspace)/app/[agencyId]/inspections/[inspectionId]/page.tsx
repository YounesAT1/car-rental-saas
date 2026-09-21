import { InspectionDetail } from "@/components/operations/inspection-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ agencyId: string; inspectionId: string }>;
}) {
  const { agencyId, inspectionId } = await params;
  return (
    <InspectionDetail
      key={inspectionId}
      agencyId={agencyId}
      inspectionId={inspectionId}
    />
  );
}
