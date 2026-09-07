import { RecoveryState } from "@/components/recovery-state";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { messages } = await getI18n();
  return (
    <RecoveryState
      title={messages.common.recovery.notFoundTitle}
      description={messages.common.recovery.notFoundDescription}
      labels={messages.common.recovery}
    />
  );
}
