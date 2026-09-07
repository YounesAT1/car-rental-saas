import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const {
  CLERK_SECRET_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CONVEX_URL,
  CONVEX_DEPLOYMENT,
  CLERK_JWT_ISSUER_DOMAIN,
} = process.env;
assert(
  CLERK_SECRET_KEY?.startsWith("sk_test_"),
  "This smoke check requires a Clerk development secret key.",
);
assert(
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"),
  "This smoke check requires a Clerk development publishable key.",
);
assert(
  CONVEX_DEPLOYMENT && /(^dev:|:dev\/)/.test(CONVEX_DEPLOYMENT),
  "This smoke check requires an explicitly selected Convex development deployment.",
);
assert(
  NEXT_PUBLIC_CONVEX_URL &&
    new URL(NEXT_PUBLIC_CONVEX_URL).protocol === "https:",
  "A Convex HTTPS URL is required.",
);

const clerkHost = Buffer.from(
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.slice(8),
  "base64",
)
  .toString("utf8")
  .replace(/\$$/, "");
assert.equal(
  CLERK_JWT_ISSUER_DOMAIN,
  `https://${clerkHost}`,
  "The configured Clerk issuer must match the publishable key.",
);

async function clerkRequest(path, method = "GET", body) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok) {
    // Do not include provider responses, request headers, keys or tokens in logs.
    throw new Error(
      `Clerk ${method} ${path.split("/")[1]} failed (${response.status}): ${result.errors?.[0]?.code ?? "unknown"}`,
    );
  }
  return result;
}

const convex = new ConvexHttpClient(NEXT_PUBLIC_CONVEX_URL);
assert.deepEqual(await convex.query(api.health.check, {}), {
  status: "ready",
  authenticated: false,
});
console.log("PASS: anonymous backend access returns no identity.");

let testUserId;
try {
  const user = await clerkRequest("/users", "POST", {
    email_address: [`foundation-${randomUUID()}@example.com`],
    password: `${randomBytes(24).toString("base64url")}aA1!`,
    private_metadata: { purpose: "phase-1-provider-smoke" },
  });
  testUserId = user.id;
  assert.equal(
    typeof testUserId,
    "string",
    "The provider must return a test user ID.",
  );
  const session = await clerkRequest("/sessions", "POST", {
    user_id: testUserId,
  });
  const { jwt } = await clerkRequest(
    `/sessions/${session.id}/tokens/convex`,
    "POST",
    {},
  );
  assert.equal(typeof jwt, "string", "The provider must issue a signed token.");
  const claims = JSON.parse(
    Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"),
  );
  assert.equal(claims.iss, CLERK_JWT_ISSUER_DOMAIN);
  assert.equal(claims.aud, "convex");
  convex.setAuth(jwt);
  assert.deepEqual(await convex.query(api.health.check, {}), {
    status: "ready",
    authenticated: true,
  });
  console.log(
    "PASS: a real Clerk token is accepted by Convex with the expected issuer and audience.",
  );

  // Change signed claims without re-signing: Convex must reject, not downgrade to anonymous.
  const segments = jwt.split(".");
  segments[1] = Buffer.from(
    JSON.stringify({ ...claims, sub: "forged-subject" }),
  ).toString("base64url");
  convex.setAuth(segments.join("."));
  await assert.rejects(() => convex.query(api.health.check, {}));
  console.log("PASS: a tampered identity token is rejected.");
} finally {
  convex.clearAuth();
  if (testUserId) {
    await clerkRequest(`/users/${testUserId}`, "DELETE");
    console.log("CLEANUP: temporary Clerk user and its sessions removed.");
  }
}
