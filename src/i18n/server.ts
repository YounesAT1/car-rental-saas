import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDirection, localeCookie, resolveLocale } from "./config";
import { dictionaries } from "./messages";

export const getI18n = cache(async () => {
  const locale = resolveLocale((await cookies()).get(localeCookie)?.value);
  return {
    locale,
    direction: getDirection(locale),
    messages: dictionaries[locale],
  };
});

const clerkLocalizations = {
  en: () => import("@clerk/localizations/en-US").then((module) => module.enUS),
  ar: () => import("@clerk/localizations/ar-SA").then((module) => module.arSA),
  fr: () => import("@clerk/localizations/fr-FR").then((module) => module.frFR),
};

export async function getClerkLocalization() {
  const { locale } = await getI18n();
  return clerkLocalizations[locale]();
}
