import { SettingsPage } from "@/components/settings/settings-page";

export default async function Page({
  params,
}: {
  params: Promise<{ agencyId: string }>;
}) {
  const { agencyId } = await params;
  return <SettingsPage agencyId={agencyId} section="branches" />;
}
