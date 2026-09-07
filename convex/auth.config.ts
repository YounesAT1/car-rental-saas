import type { AuthConfig } from "convex/server";

const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
if (!issuer || !URL.canParse(issuer) || new URL(issuer).protocol !== "https:") {
  throw new Error(
    "Set CLERK_JWT_ISSUER_DOMAIN to the Clerk HTTPS issuer in the Convex deployment environment.",
  );
}

export default {
  providers: [{ domain: issuer, applicationID: "convex" }],
} satisfies AuthConfig;
