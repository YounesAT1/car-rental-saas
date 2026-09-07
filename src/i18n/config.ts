export const locales = ["en", "fr", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeCookie = "car-rental-locale";

export const languageNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && locales.some((locale) => locale === value)
  );
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export function getDirection(locale: Locale) {
  return locale === "ar" ? "rtl" : "ltr";
}
