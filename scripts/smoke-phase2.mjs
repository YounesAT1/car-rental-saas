import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(".env.local");
assert.equal(process.env.CONVEX_DEPLOYMENT, "dev:wary-labrador-920");
assert.equal(
  process.env.NEXT_PUBLIC_CONVEX_URL,
  "https://wary-labrador-920.convex.cloud",
);
assert(
  !process.env.CONVEX_DEPLOY_KEY,
  "Do not run with a deployment key override.",
);
assert(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"));

const require = createRequire(import.meta.url);
const convexCli = join(
  dirname(require.resolve("convex/package.json")),
  "bin",
  "main.js",
);
const runCommand = promisify(execFile);
const runId = randomUUID();
const created = [];
let browser;
let pendingSignupEmail;
const artifactPath = `.tmp/phase2-${runId}`;
await mkdir(artifactPath, { recursive: true });

async function clerkRequest(path, method = "GET", body) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `Clerk request failed (${response.status}): ${result.errors?.[0]?.code ?? "unknown"}`,
    );
  return result;
}

async function saveManifest() {
  // Synthetic IDs only; never store authentication credentials or invitation tokens.
  await writeFile(
    `${artifactPath}/cleanup.json`,
    JSON.stringify(
      {
        runId,
        issuer: process.env.CLERK_JWT_ISSUER_DOMAIN,
        subjects: created.map((user) => user.id),
      },
      null,
      2,
    ),
  );
}

async function addUser(label) {
  const email = `phase2-${runId}-${label}+clerk_test@example.com`;
  assert(
    email.split("@")[0].length <= 64,
    "Test email local part must fit SMTP limits.",
  );
  const user = await clerkRequest("/users", "POST", {
    email_address: [email],
    password: `${randomBytes(24).toString("base64url")}aA1!`,
    first_name: "Phase Two",
    last_name: label,
    private_metadata: { purpose: "phase-2-smoke", runId },
  });
  created.push({ id: user.id, email });
  await saveManifest();
  return connectUser(user.id, email);
}

async function connectUser(userId, email) {
  const session = await clerkRequest("/sessions", "POST", { user_id: userId });
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL, {
    logger: false,
  });
  const refresh = async () => {
    const { jwt } = await clerkRequest(
      `/sessions/${session.id}/tokens/convex`,
      "POST",
      {},
    );
    const claims = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString(),
    );
    assert.equal(claims.iss, process.env.CLERK_JWT_ISSUER_DOMAIN);
    assert.equal(claims.aud, "convex");
    assert.equal(claims.email, email);
    assert.equal(
      claims.email_verified,
      true,
      "Verified primary email claim is required.",
    );
    client.setAuth(jwt);
  };
  await refresh();
  const profile = await client.mutation(api.identity.ensureCurrentUser, {
    locale: "en",
  });
  return { client, profile, email, refresh };
}

function invitation(owner, agencyId, email, roleKey = "EMPLOYEE") {
  return owner.client.mutation(api.identity.createInvitation, {
    agencyId,
    email,
    roleKey,
    requestKey: randomUUID(),
  });
}

try {
  console.log(
    "TARGET: development wary-labrador-920; temporary Phase 2 accounts only.",
  );
  const owner = await addUser("owner");
  const other = await addUser("other");
  const employee = await addUser("employee");
  const a = await owner.client.mutation(api.identity.createAgency, {
    name: "Phase 2 Atlas",
    slug: `phase2-${runId}-atlas`,
  });
  const b = await other.client.mutation(api.identity.createAgency, {
    name: "Phase 2 Sahara",
    slug: `phase2-${runId}-sahara`,
  });
  const anon = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL, {
    logger: false,
  });
  assert.deepEqual(await anon.query(api.identity.listAgencies, {}), []);
  await assert.rejects(
    anon.mutation(api.identity.selectAgency, { agencyId: a.agency.id }),
    /UNAUTHENTICATED/,
  );
  assert.equal(
    await other.client.query(api.identity.getWorkspace, {
      agencyId: a.agency.id,
    }),
    null,
  );
  await assert.rejects(
    other.client.mutation(api.identity.selectAgency, { agencyId: a.agency.id }),
    /AGENCY_ACCESS_DENIED/,
  );
  assert.equal(
    (await owner.client.query(api.identity.listAgencies, {}))[0].agency.id,
    a.agency.id,
  );
  assert.equal(
    (await other.client.query(api.identity.listAgencies, {}))[0].agency.id,
    b.agency.id,
  );
  console.log(
    "PASS: verified Clerk profiles, owner creation, anonymous denial and two-agency isolation.",
  );

  const invite = await invitation(owner, a.agency.id, employee.email);
  await assert.rejects(
    other.client.mutation(api.identity.acceptInvitation, {
      token: invite.token,
    }),
    /INVITATION_EMAIL_MISMATCH/,
  );
  const joined = await employee.client.mutation(api.identity.acceptInvitation, {
    token: invite.token,
  });
  assert.equal(joined.membership.roleKey, "EMPLOYEE");
  assert(!joined.permissions.includes("employee.manage"));
  assert.equal(
    (
      await employee.client.mutation(api.identity.acceptInvitation, {
        token: invite.token,
      })
    ).membership.id,
    joined.membership.id,
  );
  await assert.rejects(
    invitation(employee, a.agency.id, other.email),
    /PERMISSION_DENIED/,
  );
  await assert.rejects(
    employee.client.mutation(api.identity.updateMemberRole, {
      agencyId: a.agency.id,
      userId: employee.profile.id,
      roleKey: "AGENCY_OWNER",
    }),
    /PERMISSION_DENIED/,
  );
  await assert.rejects(
    owner.client.mutation(api.identity.revokeMembership, {
      agencyId: a.agency.id,
      userId: owner.profile.id,
    }),
    /LAST_OWNER_PROTECTED/,
  );
  await assert.rejects(
    owner.client.mutation(api.identity.updateMemberRole, {
      agencyId: a.agency.id,
      userId: owner.profile.id,
      roleKey: "EMPLOYEE",
    }),
    /LAST_OWNER_PROTECTED/,
  );
  await owner.client.mutation(api.identity.updateMemberRole, {
    agencyId: a.agency.id,
    userId: employee.profile.id,
    roleKey: "READ_ONLY",
  });
  assert.equal(
    (
      await employee.client.query(api.identity.getWorkspace, {
        agencyId: a.agency.id,
      })
    ).membership.roleKey,
    "READ_ONLY",
  );
  await owner.client.mutation(api.identity.revokeMembership, {
    agencyId: a.agency.id,
    userId: employee.profile.id,
  });
  assert.equal(
    await employee.client.query(api.identity.getWorkspace, {
      agencyId: a.agency.id,
    }),
    null,
  );
  await assert.rejects(
    employee.client.mutation(api.identity.acceptInvitation, {
      token: invite.token,
    }),
    /AGENCY_ACCESS_DENIED/,
  );
  console.log(
    "PASS: employee invitation, retry, role restrictions, last-owner protection and revocation.",
  );

  // Two owners racing to leave must still leave one active owner in a real transaction runtime.
  const secondInvite = await invitation(
    owner,
    a.agency.id,
    employee.email,
    "AGENCY_OWNER",
  );
  await employee.client.mutation(api.identity.acceptInvitation, {
    token: secondInvite.token,
  });
  const race = await Promise.allSettled([
    owner.client.mutation(api.identity.revokeMembership, {
      agencyId: a.agency.id,
      userId: owner.profile.id,
    }),
    employee.client.mutation(api.identity.revokeMembership, {
      agencyId: a.agency.id,
      userId: employee.profile.id,
    }),
  ]);
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const remaining = await Promise.all(
    [owner.client, employee.client].map((client) =>
      client.query(api.identity.getWorkspace, { agencyId: a.agency.id }),
    ),
  );
  assert.equal(
    remaining.filter(
      (workspace) => workspace?.membership.roleKey === "AGENCY_OWNER",
    ).length,
    1,
  );
  console.log(
    "PASS: concurrent owner revocation preserves one active owner on the real backend.",
  );

  if (!process.argv.includes("--backend-only")) {
    const { chromium, expect } = await import("@playwright/test");
    const { clerkSetup, clerk, setupClerkTestingToken } =
      await import("@clerk/testing/playwright");
    const { createPageObjects } =
      await import("@clerk/testing/playwright/unstable");
    await clerkSetup({
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const base = process.env.PHASE2_BASE_URL || "http://localhost:3000";
    assert.equal(new URL(base).hostname, "localhost");
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await setupClerkTestingToken({ page });
    await page.goto(base);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Welcome back!").first()).toBeVisible({
      timeout: 20000,
    });
    await page.keyboard.press("Escape");

    pendingSignupEmail = `phase2-${runId}-signup+clerk_test@example.com`;
    const signup = createPageObjects({ page, baseURL: base }).signUp;
    await signup.goTo();
    const preparedVerification = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("prepare_verification"),
    );
    await signup.signUp({
      email: pendingSignupEmail,
      password: `${randomBytes(24).toString("base64url")}aA1!`,
    });
    await signup.waitForEmailVerificationScreen();
    const prepared = await preparedVerification;
    assert(
      prepared.ok(),
      `Test email verification preparation failed (${prepared.status()}).`,
    );
    await signup.enterTestOtpCode({ awaitRequests: false });
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30000 });
    const signedUpId = await page.evaluate(() => window.Clerk.user.id);
    created.push({ id: signedUpId, email: pendingSignupEmail });
    await saveManifest();
    const browserOwner = await connectUser(signedUpId, pendingSignupEmail);
    pendingSignupEmail = undefined;
    console.log(
      "PASS: real browser signup and test email verification reach onboarding.",
    );
    await expect(
      page.getByRole("heading", { name: "Create your agency" }),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Create agency", exact: true })
      .click();
    await expect(page.getByText("Use at least 2 characters")).toBeVisible();
    await page
      .getByLabel("Agency name", { exact: true })
      .fill("Phase 2 Browser");
    await page
      .getByLabel("Workspace URL", { exact: true })
      .fill(`phase2-${runId}-browser`);
    await page
      .getByRole("button", { name: "Create agency", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/[a-z0-9]+$/, { timeout: 30000 });
    const browserAgencyId = new URL(page.url()).pathname.split("/").at(-1);
    await expect(page.getByText("AGENCY OWNER", { exact: true })).toBeVisible();
    const browserEmployee = await addUser("webstaff");
    await page
      .getByLabel("Work email", { exact: true })
      .fill(browserEmployee.email);
    await page
      .getByRole("button", { name: "Create invitation", exact: true })
      .click();
    const inviteInput = page.getByLabel("Invitation link", { exact: true });
    await expect(inviteInput).toBeVisible({ timeout: 15000 });
    const inviteUrl = await inviteInput.inputValue();
    await page.screenshot({
      path: `${artifactPath}/owner-desktop.png`,
      fullPage: true,
    });
    for (const [locale, language] of [
      ["ar", "العربية"],
      ["fr", "Français"],
      ["en", "English"],
    ]) {
      await page.locator(".language-trigger").click();
      await page
        .getByRole("menuitemradio", { name: language, exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await expect(
        page.getByLabel(
          locale === "ar"
            ? "البريد الإلكتروني للعمل"
            : locale === "fr"
              ? "Adresse e-mail professionnelle"
              : "Work email",
          { exact: true },
        ),
      ).toBeVisible();
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          `${locale} overflows at ${width}px`,
        );
      }
      await page.locator(".floating-theme-toggle").click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: `${artifactPath}/owner-${locale}-dark-mobile.png`,
        fullPage: true,
      });
      await page.locator(".floating-theme-toggle").click();
    }
    console.log(
      "PASS: English, French and Arabic RTL, both themes and 320/390/768/1440px workspace widths.",
    );

    const employeeContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const employeePage = await employeeContext.newPage();
    employeePage.on("pageerror", (error) => pageErrors.push(error.message));
    await setupClerkTestingToken({ page: employeePage });
    await employeePage.goto(inviteUrl);
    await expect(employeePage).toHaveURL(/\/sign-in\?/, { timeout: 30000 });
    assert.equal(
      new URL(employeePage.url()).searchParams.get("redirect_url"),
      new URL(inviteUrl).pathname + new URL(inviteUrl).search,
    );
    await clerk.signIn({
      page: employeePage,
      emailAddress: browserEmployee.email,
    });
    await employeePage.goto(inviteUrl);
    await expect(employeePage).toHaveURL(
      new RegExp(`/app/${browserAgencyId}$`),
      { timeout: 30000 },
    );
    await expect(
      employeePage.getByText("EMPLOYEE", { exact: true }),
    ).toBeVisible();
    await expect(
      employeePage.getByRole("heading", { name: "Invite a teammate" }),
    ).toHaveCount(0);
    assert(
      await employeePage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await employeePage.screenshot({
      path: `${artifactPath}/employee-mobile.png`,
      fullPage: true,
    });
    await browserOwner.refresh();
    await browserOwner.client.mutation(api.identity.revokeMembership, {
      agencyId: browserAgencyId,
      userId: browserEmployee.profile.id,
    });
    // /agencies/select is a compatibility route which redirects to onboarding.
    await expect(employeePage).toHaveURL(/\/onboarding$/, { timeout: 30000 });
    await expect(
      employeePage.getByRole("heading", { name: "Create your agency" }),
    ).toBeVisible();
    assert.deepEqual(pageErrors, []);
    console.log(
      "PASS: browser sign-in, onboarding validation, agency creation, invitation redirect, employee access and reactive revocation.",
    );
    await browser.close();
    browser = undefined;
  }
} catch (error) {
  if (browser) {
    let index = 0;
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        await page
          .screenshot({
            path: `${artifactPath}/failure-${index++}.png`,
            fullPage: true,
          })
          .catch(() => undefined);
      }
  }
  throw error;
} finally {
  await browser?.close();
  if (pendingSignupEmail) {
    const matches = await clerkRequest(
      `/users?${new URLSearchParams({ "email_address[]": pendingSignupEmail })}`,
    );
    for (const user of matches) {
      if (
        !created.some((entry) => entry.id === user.id) &&
        user.email_addresses.some(
          (address) => address.email_address === pendingSignupEmail,
        )
      )
        created.push({ id: user.id, email: pendingSignupEmail });
    }
  }
  await saveManifest();
  let cleanupFailed = false;
  try {
    const { stdout } = await runCommand(
      process.execPath,
      [
        convexCli,
        "run",
        "testing:cleanupPhase2",
        JSON.stringify({
          runId,
          issuer: process.env.CLERK_JWT_ISSUER_DOMAIN,
          subjects: created.map((user) => user.id),
        }),
        "--deployment",
        "wary-labrador-920",
      ],
      { timeout: 60000 },
    );
    const result = JSON.parse(stdout);
    console.log(
      `CLEANUP: ${result.users} synthetic Convex users and ${result.agencies} test agencies removed with their related rows.`,
    );
  } catch {
    cleanupFailed = true;
    console.error(
      `CLEANUP REQUIRED: Convex cleanup failed; rerun using ${artifactPath}/cleanup.json.`,
    );
  }
  for (const user of created) {
    try {
      await clerkRequest(`/users/${user.id}`, "DELETE");
    } catch {
      cleanupFailed = true;
      console.error(
        `CLEANUP REQUIRED: a synthetic Clerk user remains; see ${artifactPath}/cleanup.json.`,
      );
    }
  }
  if (cleanupFailed) process.exitCode = 1;
  else console.log("CLEANUP: temporary Clerk accounts and sessions removed.");
}
