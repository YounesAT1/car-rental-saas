"use client";

import { RecoveryState } from "@/components/recovery-state";
import { useI18n } from "@/i18n/client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { messages } = useI18n();
  return (
    <RecoveryState
      title={messages.recovery.errorTitle}
      description={messages.recovery.errorDescription}
      labels={messages.recovery}
      reset={reset}
      reference={error.digest}
    />
  );
}
