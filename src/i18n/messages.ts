import en from "./messages/en.json";
import ar from "./messages/ar.json";
import fr from "./messages/fr.json";
import type { Locale } from "./config";

export type Messages = typeof en;
export type CommonMessages = Messages["common"];

export const dictionaries: Record<Locale, Messages> = { en, ar, fr };
