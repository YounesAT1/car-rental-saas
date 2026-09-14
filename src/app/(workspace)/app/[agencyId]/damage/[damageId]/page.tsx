import { DamageDetail } from "@/components/operations/damage-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ agencyId: string; damageId: string }>;
}) {
  const { agencyId, damageId } = await params;
  return <DamageDetail agencyId={agencyId} damageId={damageId} />;
}
