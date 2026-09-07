"use client";

import { Globe2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeLocale } from "@/i18n/actions";
import { useI18n } from "@/i18n/client";
import { getDirection, isLocale, languageNames, locales } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      <DropdownMenu dir={getDirection(locale)}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="language-trigger h-11 gap-1.5 rounded-full px-2.5 text-xs font-medium sm:px-3"
            aria-label={`${messages.language.label}: ${languageNames[locale]}`}
            aria-busy={pending}
            disabled={pending}
            title={messages.language.label}
          >
            {pending ? (
              <LoaderCircle
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Globe2 className="size-4" aria-hidden="true" />
            )}
            <span lang="en" dir="ltr">
              {locale.toUpperCase()}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={12}
          className="w-44 max-w-[calc(100vw-24px)] rounded-2xl bg-popover/95 p-1.5 shadow-none backdrop-blur-xl"
          aria-label={messages.language.label}
        >
          <DropdownMenuRadioGroup value={locale} onValueChange={selectLanguage}>
            {locales.map((language) => (
              <DropdownMenuRadioItem
                key={language}
                value={language}
                disabled={pending}
                className="rounded-xl"
              >
                <span lang={language} dir={getDirection(language)}>
                  {languageNames[language]}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
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
