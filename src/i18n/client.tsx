"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "./config";
import type { CommonMessages } from "./messages";

type I18nValue = { locale: Locale; messages: CommonMessages };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  locale,
  messages,
}: I18nValue & { children: ReactNode }) {
  return <I18nContext value={{ locale, messages }}>{children}</I18nContext>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is missing");
  return value;
}
