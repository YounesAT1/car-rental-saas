import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  countries,
  currencies,
  decimalToMinor,
  defaultHours,
  draftPolicy,
  isBranchOpenAt,
  settingsSchemas,
  timezones,
} from "../src/lib/agency-settings";

const modules = {
  "../convex/_generated/server.js": () => import("../convex/_generated/server"),
  "../convex/identity.ts": () => import("../convex/identity"),
  "../convex/branches.ts": () => import("../convex/branches"),
  "../convex/agencySettings.ts": () => import("../convex/agencySettings"),
};
const page = { numItems: 10, cursor: null };
const branchValues = () => ({
  name: "Casablanca Airport",
  code: "CMN-01",
  address: "Terminal 1",
  city: "Casablanca",
  postalCode: "20000",
  country: "MA" as const,
  timezone: "Africa/Casablanca" as const,
  phone: "+212600000000",
  contactEmail: "desk@example.com",
  hours: defaultHours(),
  closures: [],
});
const policyValues = () => ({
  ...draftPolicy,
  depositAmountMinor: 250000,
  terms: {
    en: "Rental, cancellation, mileage, fuel and deposit terms.",
    fr: "Conditions de location.",
    ar: "شروط التأجير.",
  },
});
async function fixture() {
  const t = convexTest(schema, modules);
  const identify = (subject: string) =>
    t.withIdentity({
      subject,
      issuer: "https://test.clerk.accounts.dev",
      email: `${subject}@example.com`,
      emailVerified: true,
    });
  const owner = identify("owner");
  const outsider = identify("outsider");
  const employee = identify("employee");
  await owner.mutation(api.identity.ensureCurrentUser, {});
  await outsider.mutation(api.identity.ensureCurrentUser, {});
  const staff = await employee.mutation(api.identity.ensureCurrentUser, {});
  const a = (
    await owner.mutation(api.identity.createAgency, {
      name: "Atlas",
      slug: "atlas",
    })
  ).agency.id;
  const b = (
    await outsider.mutation(api.identity.createAgency, {
      name: "Sahara",
      slug: "sahara",
    })
  ).agency.id;
  const invitation = await owner.mutation(api.identity.createInvitation, {
    agencyId: a,
    email: "employee@example.com",
    roleKey: "EMPLOYEE",
    requestKey: crypto.randomUUID(),
  });
  await employee.mutation(api.identity.acceptInvitation, {
    token: invitation.token!,
  });
  const settings = await owner.query(api.agencySettings.getBusiness, {
    agencyId: a,
  });
  const business = settingsSchemas().business.parse(settings);
  return { t, owner, outsider, employee, staff, a, b, business };
}

describe("business settings", () => {
  test("legacy agencies read defaults and save audited updates without changing their URL", async () => {
    const { t, owner, a, business } = await fixture();
    await t.run((ctx) =>
      ctx.db.patch(a, {
        revision: undefined,
        country: undefined,
        defaultLocale: undefined,
      }),
    );
    expect(
      await owner.query(api.agencySettings.getBusiness, { agencyId: a }),
    ).toMatchObject({
      revision: 0,
      country: "MA",
      currency: "MAD",
      timezone: "Africa/Casablanca",
      defaultLocale: "en",
    });
    const updated = await owner.mutation(api.agencySettings.saveBusiness, {
      agencyId: a,
      expectedRevision: 0,
      values: {
        ...business,
        legalName: "Atlas SARL",
        name: "Atlas Morocco",
        currency: "EUR",
        defaultLocale: "fr",
      },
    });
    expect(updated).toMatchObject({
      revision: 1,
      name: "Atlas Morocco",
      slug: "atlas",
      currency: "EUR",
      defaultLocale: "fr",
    });
    const audits = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_agency_time", (q) => q.eq("agencyId", a))
        .collect(),
    );
    expect(
      audits.filter((row) => row.action === "agency.settings.updated"),
    ).toHaveLength(1);
  });
  test("stale saves cannot overwrite changes and invalid server input leaves no write", async () => {
    const { owner, a, business } = await fixture();
    await owner.mutation(api.agencySettings.saveBusiness, {
      agencyId: a,
      expectedRevision: 0,
      values: { ...business, name: "Updated" },
    });
    await expect(
      owner.mutation(api.agencySettings.saveBusiness, {
        agencyId: a,
        expectedRevision: 0,
        values: business,
      }),
    ).rejects.toThrow("SETTINGS_CONFLICT");
    for (const values of [
      { ...business, timezone: "+01:00" },
      { ...business, currency: "XXX" },
      { ...business, website: "javascript:alert(1)" },
      { ...business, contactEmail: "invalid" },
    ]) {
      await expect(
        owner.mutation(api.agencySettings.saveBusiness, {
          agencyId: a,
          expectedRevision: 1,
          values,
        }),
      ).rejects.toThrow("INVALID_SETTINGS");
    }
    expect(
      await owner.query(api.agencySettings.getBusiness, { agencyId: a }),
    ).toMatchObject({ name: "Updated", revision: 1 });
  });
  test("agency creation validates regional values too", async () => {
    const { owner } = await fixture();
    await expect(
      owner.mutation(api.identity.createAgency, {
        name: "Invalid",
        slug: "invalid",
        timezone: "Fake/Timezone",
      }),
    ).rejects.toThrow("INVALID_TIMEZONE");
    await expect(
      owner.mutation(api.identity.createAgency, {
        name: "Invalid",
        slug: "invalid",
        currency: "XXX",
      }),
    ).rejects.toThrow("INVALID_CURRENCY");
  });
});

describe("branch authorization and lifecycle", () => {
  test("anonymous, unrelated tenants and employees cannot write any settings", async () => {
    const { t, outsider, employee, owner, a, b, business } = await fixture();
    const branch = await owner.mutation(api.branches.create, {
      agencyId: a,
      values: branchValues(),
    });
    for (const actor of [t, outsider, employee]) {
      await expect(
        actor.query(api.agencySettings.getBusiness, { agencyId: a }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.agencySettings.saveBusiness, {
          agencyId: a,
          expectedRevision: 0,
          values: business,
        }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.branches.create, {
          agencyId: a,
          values: branchValues(),
        }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.branches.update, {
          agencyId: a,
          branchId: branch.id,
          expectedRevision: 1,
          values: branchValues(),
        }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.branches.setStatus, {
          agencyId: a,
          branchId: branch.id,
          expectedRevision: 1,
          status: "archived",
        }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.agencySettings.publishPolicy, {
          agencyId: a,
          expectedVersion: 0,
          expectedAgencyRevision: 0,
          values: policyValues(),
        }),
      ).rejects.toThrow();
    }
    for (const actor of [t, outsider]) {
      await expect(
        actor.query(api.branches.list, {
          agencyId: a,
          status: "active",
          paginationOpts: page,
        }),
      ).rejects.toThrow();
      await expect(
        actor.query(api.branches.get, { agencyId: a, branchId: branch.id }),
      ).rejects.toThrow();
      await expect(
        actor.query(api.agencySettings.getCurrentPolicy, { agencyId: a }),
      ).rejects.toThrow();
      await expect(
        actor.query(api.agencySettings.listPolicyHistory, {
          agencyId: a,
          paginationOpts: page,
        }),
      ).rejects.toThrow();
    }
    for (const operation of [
      outsider.query(api.branches.get, { agencyId: b, branchId: branch.id }),
      outsider.mutation(api.branches.update, {
        agencyId: b,
        branchId: branch.id,
        expectedRevision: 1,
        values: branchValues(),
      }),
      outsider.mutation(api.branches.setStatus, {
        agencyId: b,
        branchId: branch.id,
        expectedRevision: 1,
        status: "archived",
      }),
    ])
      await expect(operation).rejects.toThrow("BRANCH_NOT_FOUND");
    expect(
      (
        await employee.query(api.branches.list, {
          agencyId: a,
          status: "active",
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(1);
  });
  test("normalized codes are unique per agency and remain reserved after archival", async () => {
    const { owner, outsider, a, b } = await fixture();
    const first = await owner.mutation(api.branches.create, {
      agencyId: a,
      values: { ...branchValues(), code: " cmn-01 " },
    });
    expect(first.code).toBe("CMN-01");
    await expect(
      owner.mutation(api.branches.create, {
        agencyId: a,
        values: branchValues(),
      }),
    ).rejects.toThrow("BRANCH_CODE_TAKEN");
    await outsider.mutation(api.branches.create, {
      agencyId: b,
      values: branchValues(),
    });
    const archived = await owner.mutation(api.branches.setStatus, {
      agencyId: a,
      branchId: first.id,
      expectedRevision: 1,
      status: "archived",
    });
    expect(
      (
        await owner.query(api.branches.list, {
          agencyId: a,
          status: "active",
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(0);
    expect(
      (
        await owner.query(api.branches.list, {
          agencyId: a,
          status: "archived",
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(1);
    await expect(
      owner.mutation(api.branches.create, {
        agencyId: a,
        values: branchValues(),
      }),
    ).rejects.toThrow("BRANCH_CODE_TAKEN");
    await expect(
      owner.mutation(api.branches.update, {
        agencyId: a,
        branchId: first.id,
        expectedRevision: 2,
        values: branchValues(),
      }),
    ).rejects.toThrow("BRANCH_ARCHIVED");
    const restored = await owner.mutation(api.branches.setStatus, {
      agencyId: a,
      branchId: first.id,
      expectedRevision: archived.revision,
      status: "active",
    });
    expect(restored).toMatchObject({
      id: first.id,
      revision: 3,
      status: "active",
    });
    await expect(
      owner.mutation(api.branches.update, {
        agencyId: a,
        branchId: first.id,
        expectedRevision: 1,
        values: branchValues(),
      }),
    ).rejects.toThrow("SETTINGS_CONFLICT");
  });
  test("invalid or overlapping hours and impossible closure dates are rejected by mutations", async () => {
    const { owner, a } = await fixture();
    const invalid = [
      { ...branchValues(), hours: [{ day: 1, intervals: [] }] },
      {
        ...branchValues(),
        hours: defaultHours().map((d) => ({ ...d, day: 1 })),
      },
      {
        ...branchValues(),
        hours: defaultHours().map((d) =>
          d.day === 1
            ? { ...d, intervals: [{ opens: "19:00", closes: "09:00" }] }
            : d,
        ),
      },
      {
        ...branchValues(),
        hours: defaultHours().map((d) =>
          d.day === 1
            ? {
                ...d,
                intervals: [
                  { opens: "09:00", closes: "13:00" },
                  { opens: "12:00", closes: "18:00" },
                ],
              }
            : d,
        ),
      },
      {
        ...branchValues(),
        closures: [{ date: "2026-02-30", reason: "Holiday" }],
      },
      {
        ...branchValues(),
        closures: [
          { date: "2026-10-01", reason: "" },
          { date: "2026-10-01", reason: "" },
        ],
      },
    ];
    for (const values of invalid)
      await expect(
        owner.mutation(api.branches.create, { agencyId: a, values }),
      ).rejects.toThrow("INVALID_SETTINGS");
    expect(
      (
        await owner.query(api.branches.list, {
          agencyId: a,
          status: "active",
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(0);
  });
  test("revocation, suspended agencies and disabled accounts lose settings access", async () => {
    const { t, owner, employee, staff, a } = await fixture();
    await owner.mutation(api.identity.revokeMembership, {
      agencyId: a,
      userId: staff.id,
    });
    await expect(
      employee.query(api.branches.list, {
        agencyId: a,
        status: "active",
        paginationOpts: page,
      }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
    await t.run((ctx) => ctx.db.patch(a, { status: "suspended" }));
    await expect(
      owner.query(api.agencySettings.getBusiness, { agencyId: a }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
    await t.run(async (ctx) => {
      await ctx.db.patch(a, { status: "active" });
      const agency = await ctx.db.get(a);
      await ctx.db.patch(agency!.createdByUserId, { status: "disabled" });
    });
    await expect(
      owner.mutation(api.branches.create, {
        agencyId: a,
        values: branchValues(),
      }),
    ).rejects.toThrow("USER_DISABLED");
  });
});

describe("immutable policy versions", () => {
  test("legacy policy counters do not manufacture a published version; currency and old terms stay immutable", async () => {
    const { t, owner, employee, a, business } = await fixture();
    await t.run((ctx) => ctx.db.patch(a, { policyVersion: 1 }));
    expect(
      (await owner.query(api.agencySettings.getCurrentPolicy, { agencyId: a }))
        .policy,
    ).toBeNull();
    const first = await owner.mutation(api.agencySettings.publishPolicy, {
      agencyId: a,
      expectedVersion: 0,
      expectedAgencyRevision: 0,
      values: policyValues(),
    });
    expect(first).toMatchObject({ version: 1, currency: "MAD" });
    await owner.mutation(api.agencySettings.saveBusiness, {
      agencyId: a,
      expectedRevision: 0,
      values: { ...business, currency: "EUR" },
    });
    await expect(
      owner.mutation(api.agencySettings.publishPolicy, {
        agencyId: a,
        expectedVersion: 1,
        expectedAgencyRevision: 0,
        values: policyValues(),
      }),
    ).rejects.toThrow("SETTINGS_CONFLICT");
    const second = await owner.mutation(api.agencySettings.publishPolicy, {
      agencyId: a,
      expectedVersion: 1,
      expectedAgencyRevision: 1,
      values: { ...policyValues(), minimumDriverAge: 25 },
    });
    expect(second).toMatchObject({
      version: 2,
      currency: "EUR",
      minimumDriverAge: 25,
    });
    expect(await t.run((ctx) => ctx.db.get(first.id))).toMatchObject({
      version: 1,
      currency: "MAD",
      minimumDriverAge: 21,
    });
    const history = await employee.query(api.agencySettings.listPolicyHistory, {
      agencyId: a,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(history.page[0]?.id).toBe(second.id);
    const next = await employee.query(api.agencySettings.listPolicyHistory, {
      agencyId: a,
      paginationOpts: { numItems: 1, cursor: history.continueCursor },
    });
    expect(next.page[0]?.id).toBe(first.id);
    await expect(
      owner.mutation(api.agencySettings.publishPolicy, {
        agencyId: a,
        expectedVersion: 1,
        expectedAgencyRevision: 1,
        values: policyValues(),
      }),
    ).rejects.toThrow("SETTINGS_CONFLICT");
  });
  test("empty terms, unsafe money and invalid policy numbers cannot publish", async () => {
    const { owner, a } = await fixture();
    for (const values of [
      { ...policyValues(), depositAmountMinor: 2.5 },
      { ...policyValues(), depositAmountMinor: Infinity },
      { ...policyValues(), terms: { en: "  ", fr: "", ar: "" } },
      { ...policyValues(), maximumRentalDays: 0 },
    ]) {
      await expect(
        owner.mutation(api.agencySettings.publishPolicy, {
          agencyId: a,
          expectedVersion: 0,
          expectedAgencyRevision: 0,
          values,
        }),
      ).rejects.toThrow("INVALID_SETTINGS");
    }
    expect(
      (await owner.query(api.agencySettings.getCurrentPolicy, { agencyId: a }))
        .policy,
    ).toBeNull();
  });
});

test("local opening hours follow Morocco offset changes and closures use the branch date", () => {
  const branch = branchValues();
  expect(isBranchOpenAt(branch, Date.parse("2026-02-24T08:30:00Z"))).toBe(
    false,
  );
  expect(isBranchOpenAt(branch, Date.parse("2026-04-14T08:30:00Z"))).toBe(true);
  expect(isBranchOpenAt(branch, Date.parse("2026-04-14T17:00:00Z"))).toBe(
    false,
  );
  expect(
    isBranchOpenAt(
      { ...branch, closures: [{ date: "2026-04-14", reason: "Holiday" }] },
      Date.parse("2026-04-14T08:30:00Z"),
    ),
  ).toBe(false);
  const overnight = {
    ...branch,
    timezone: "Asia/Dubai" as const,
    hours: defaultHours().map((h) => ({
      ...h,
      intervals: [{ opens: "00:00", closes: "24:00" }],
    })),
    closures: [{ date: "2026-01-09", reason: "Closed" }],
  };
  expect(isBranchOpenAt(overnight, Date.parse("2026-01-08T21:00:00Z"))).toBe(
    false,
  );
  expect(isBranchOpenAt(overnight, Date.parse("2026-01-08T19:59:00Z"))).toBe(
    true,
  );
});
test("money entry is exact and respects currency precision", () => {
  expect(decimalToMinor("2500.10", "MAD")).toBe(250010);
  expect(decimalToMinor("2500,10", "MAD")).toBe(250010);
  expect(decimalToMinor("1.001", "TND")).toBe(1001);
  expect(decimalToMinor("1.001", "MAD")).toBeNaN();
  expect(decimalToMinor("1e4", "MAD")).toBeNaN();
  expect(decimalToMinor("-20", "MAD")).toBeNaN();
});
test("supported settings values are genuine regional identifiers", () => {
  for (const timezone of timezones)
    expect(() =>
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format(),
    ).not.toThrow();
  for (const currency of currencies)
    expect(Intl.supportedValuesOf("currency")).toContain(currency);
  const regions = new Intl.DisplayNames("en", {
    type: "region",
    fallback: "none",
  });
  for (const country of countries) expect(regions.of(country)).toBeTruthy();
});
