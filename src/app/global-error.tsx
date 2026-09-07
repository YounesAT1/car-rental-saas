"use client";

import { RecoveryState } from "@/components/recovery-state";
import { getDirection } from "@/i18n/config";
import { dictionaries } from "@/i18n/messages";
import { useFallbackLocale } from "@/i18n/fallback";
import { fontClasses } from "./fonts";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useFallbackLocale();
  const labels = dictionaries[locale].common.recovery;
  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body className={fontClasses}>
        <main className="flex min-h-svh">
          <RecoveryState
            title={labels.globalTitle}
            description={labels.globalDescription}
            labels={labels}
            reset={reset}
            reference={error.digest}
          />
        </main>
      </body>
    </html>
  );
}
