"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeLocale } from "@/i18n/actions";
import { useI18n } from "@/i18n/client";
import { isLocale, languageNames, locales } from "@/i18n/config";
import { cn } from "@/lib/utils";

const languageFlags = {
  en: "🇬🇧",
  fr: "🇫🇷",
  ar: "🇸🇦",
} as const;

export function LanguageSwitcher() {
  const { locale, messages } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function selectLanguage(value: string) {
    if (!isLocale(value) || value === locale) return;
    setFailed(false);
    startTransition(async () => {
      try {
        await changeLocale(value);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="language-control">
      <div
        className="language-segmented"
        role="group"
        aria-label={messages.language.label}
        aria-busy={pending}
      >
        {locales.map((language) => (
          <button
            key={language}
            type="button"
            className={cn(
              "language-option",
              language === locale && "language-option-active",
            )}
            aria-pressed={language === locale}
            aria-label={languageNames[language]}
            disabled={pending}
            onClick={() => selectLanguage(language)}
            title={languageNames[language]}
          >
            <span className="language-flag" aria-hidden="true">
              {languageFlags[language]}
            </span>
            <span lang="en" dir="ltr">
              {language.toUpperCase()}
            </span>
            {pending && language === locale && (
              <LoaderCircle
                className="language-spinner size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>
      <span className="sr-only" role="status">
        {pending ? messages.language.pending : ""}
      </span>
      {failed && (
        <p role="alert" className="language-error">
          {messages.language.error}
        </p>
      )}
    </div>
  );
}
