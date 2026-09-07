import { readFileSync } from "node:fs";

const locales = ["en", "fr", "ar"];

function flatten(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object"
      ? flatten(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const catalogs = locales.map((locale) =>
  JSON.parse(readFileSync(`src/i18n/messages/${locale}.json`, "utf8")),
);
const keySets = catalogs.map((catalog) => new Set(flatten(catalog)));
const referenceKeys = [...keySets[0]].sort();

for (const [index, keys] of keySets.entries()) {
  const sortedKeys = [...keys].sort();
  if (sortedKeys.join("|") !== referenceKeys.join("|")) {
    const missing = referenceKeys.filter((key) => !keys.has(key));
    const extra = sortedKeys.filter((key) => !keySets[0].has(key));
    throw new Error(
      `${locales[index]} catalog mismatch. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`,
    );
  }
}

console.log(
  `i18n catalog parity passed: ${referenceKeys.length} keys across ${locales.join(", ")}.`,
);
