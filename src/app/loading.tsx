import { WorkspaceLoading } from "@/components/workspace-loading";
import { getI18n } from "@/i18n/server";

export default async function Loading() {
  const { messages } = await getI18n();
  return <WorkspaceLoading label={messages.common.loading} variant="page" />;
}
