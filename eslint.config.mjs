import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
    },
  },
  globalIgnores([
    ".agents/**",
    ".claude/**",
    ".next/**",
    ".cache/**",
    ".tmp/**",
    "convex/_generated/**",
    "next-env.d.ts",
  ]),
]);
