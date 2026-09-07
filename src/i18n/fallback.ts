"use client";

import { useSyncExternalStore } from "react";
import { defaultLocale, localeCookie, resolveLocale } from "./config";

const subscribe = () => () => {};
const getServerSnapshot = () => defaultLocale;

function readSavedLocale() {
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${localeCookie}=`))
    ?.slice(localeCookie.length + 1);
  return resolveLocale(value);
}

// Root error boundaries cannot rely on the layout or its providers.
export function useFallbackLocale() {
  return useSyncExternalStore(subscribe, readSavedLocale, getServerSnapshot);
}
