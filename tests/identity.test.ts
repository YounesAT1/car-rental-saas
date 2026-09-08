import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  canGrantRole,
  hasPermission,
  roleKeys,
} from "../convex/lib/permissions";

const modules = {
  "../convex/_generated/server.js": () => import("../convex/_generated/server"),
  "../convex/identity.ts": () => import("../convex/identity"),
  "../convex/testing.ts": () => import("../convex/testing"),
};
function identity(subject: string, verified = true) {
  return {
    subject,
    issuer: "https://test.clerk.accounts.dev",
    email: `${subject}@example.com`,
    emailVerified: verified,
  };
}
async function fixture() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(identity("owner"));
  const outsider = t.withIdentity(identity("outsider"));
  const employee = t.withIdentity(identity("employee"));
  const ownerUser = await owner.mutation(api.identity.ensureCurrentUser, {});
  const outsiderUser = await outsider.mutation(
    api.identity.ensureCurrentUser,
    {},
  );
  const employeeUser = await employee.mutation(
    api.identity.ensureCurrentUser,
    {},
  );
  const a = await owner.mutation(api.identity.createAgency, {
    name: "Atlas Rentals",
    slug: "atlas",
  });
  const b = await outsider.mutation(api.identity.createAgency, {
    name: "Sahara Drive",
    slug: "sahara",
  });
  const invite = (
    roleKey: "EMPLOYEE" | "AGENCY_ADMIN" | "AGENCY_OWNER" = "EMPLOYEE",
  ) =>
    owner.mutation(api.identity.createInvitation, {
      agencyId: a.agency.id,
      email: "employee@example.com",
      roleKey,
      requestKey: crypto.randomUUID(),
    });
  return {
    t,
    owner,
    outsider,
    employee,
    ownerUser,
    outsiderUser,
    employeeUser,
    a,
    b,
    invite,
  };
}

describe("identity and agency isolation", () => {
  test("anonymous reads disclose no profile or memberships and mutations require authentication", async () => {
    const { t, a, employeeUser } = await fixture();
    expect(await t.query(api.identity.getCurrentUser, {})).toBeNull();
    expect(await t.query(api.identity.listAgencies, {})).toEqual([]);
    expect(
      await t.query(api.identity.getWorkspace, { agencyId: a.agency.id }),
    ).toBeNull();
    await expect(
      t.mutation(api.identity.ensureCurrentUser, {}),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      t.mutation(api.identity.createAgency, { name: "Bad", slug: "bad" }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      t.mutation(api.identity.selectAgency, { agencyId: a.agency.id }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      t.mutation(api.identity.acceptInvitation, { token: "a".repeat(64) }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      t.mutation(api.identity.createInvitation, {
        agencyId: a.agency.id,
        email: "nobody@example.com",
        roleKey: "EMPLOYEE",
        requestKey: "anonymous",
      }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      t.mutation(api.identity.updateMemberRole, {
        agencyId: a.agency.id,
        userId: employeeUser.id,
        roleKey: "MANAGER",
      }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      t.mutation(api.identity.revokeMembership, {
        agencyId: a.agency.id,
        userId: employeeUser.id,
      }),
    ).rejects.toThrow("UNAUTHENTICATED");
  });
  test("profile sync is idempotent, issuer scoped, and creates one preference record", async () => {
    const { t, owner, ownerUser } = await fixture();
    expect(
      (await owner.mutation(api.identity.ensureCurrentUser, { locale: "ar" }))
        .id,
    ).toBe(ownerUser.id);
    const sameSubject = t.withIdentity({
      ...identity("owner"),
      issuer: "https://another.clerk.accounts.dev",
    });
    expect(
      (await sameSubject.mutation(api.identity.ensureCurrentUser, {})).id,
    ).not.toBe(ownerUser.id);
    const preferences = await t.run((ctx) =>
      ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", ownerUser.id))
        .collect(),
    );
    expect(preferences).toHaveLength(1);
  });
  test("sync cannot reactivate a disabled user", async () => {
    const { t, owner, ownerUser, a } = await fixture();
    await t.run((ctx) => ctx.db.patch(ownerUser.id, { status: "disabled" }));
    await expect(
      owner.mutation(api.identity.ensureCurrentUser, {}),
    ).rejects.toThrow("USER_DISABLED");
    expect((await t.run((ctx) => ctx.db.get(ownerUser.id)))?.status).toBe(
      "disabled",
    );
    expect(
      await owner.query(api.identity.getWorkspace, { agencyId: a.agency.id }),
    ).toBeNull();
    await expect(
      owner.mutation(api.identity.createAgency, {
        name: "Blocked",
        slug: "blocked",
      }),
    ).rejects.toThrow("USER_DISABLED");
  });
  test("agency creation creates owner, preferences and audit atomically; duplicate slug leaves no extra rows", async () => {
    const { t, owner, ownerUser, a } = await fixture();
    expect(a.membership.roleKey).toBe("AGENCY_OWNER");
    expect(a.agency).toMatchObject({
      currency: "MAD",
      timezone: "Africa/Casablanca",
    });
    await expect(
      owner.mutation(api.identity.createAgency, {
        name: "Duplicate",
        slug: " ATLAS ",
      }),
    ).rejects.toThrow("AGENCY_SLUG_TAKEN");
    expect(await owner.query(api.identity.listAgencies, {})).toHaveLength(1);
    const prefs = await t.run((ctx) =>
      ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", ownerUser.id))
        .unique(),
    );
    expect(prefs?.lastAgencyId).toBe(a.agency.id);
    const audits = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_agency_time", (q) => q.eq("agencyId", a.agency.id))
        .collect(),
    );
    expect(audits.map((x) => x.action)).toEqual(["agency.created"]);
  });
  test("cross-agency selectors and writes are rejected without changing either agency", async () => {
    const { owner, outsider, a, b, employeeUser } = await fixture();
    expect(
      (await owner.query(api.identity.listAgencies, {})).map(
        (x) => x.agency.id,
      ),
    ).toEqual([a.agency.id]);
    expect(
      await owner.query(api.identity.getWorkspace, { agencyId: b.agency.id }),
    ).toBeNull();
    await expect(
      owner.mutation(api.identity.selectAgency, { agencyId: b.agency.id }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
    await expect(
      outsider.mutation(api.identity.createInvitation, {
        agencyId: a.agency.id,
        email: "x@example.com",
        roleKey: "EMPLOYEE",
        requestKey: "cross-tenant",
      }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
    await expect(
      outsider.mutation(api.identity.updateMemberRole, {
        agencyId: a.agency.id,
        userId: employeeUser.id,
        roleKey: "AGENCY_OWNER",
      }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
    await expect(
      outsider.mutation(api.identity.revokeMembership, {
        agencyId: a.agency.id,
        userId: employeeUser.id,
      }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
  });
  test("suspended agencies disappear and deny writes", async () => {
    const { t, owner, a } = await fixture();
    await t.run((ctx) => ctx.db.patch(a.agency.id, { status: "suspended" }));
    expect(await owner.query(api.identity.listAgencies, {})).toEqual([]);
    expect(
      await owner.query(api.identity.getWorkspace, { agencyId: a.agency.id }),
    ).toBeNull();
    await expect(
      owner.mutation(api.identity.selectAgency, { agencyId: a.agency.id }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
  });
});

describe("invitations and membership lifecycle", () => {
  test("invitation token is hashed and exact request replay creates only one receipt/invitation", async () => {
    const { t, owner, a } = await fixture();
    const args = {
      agencyId: a.agency.id,
      email: "employee@example.com",
      roleKey: "EMPLOYEE" as const,
      requestKey: "stable-request-key",
    };
    const first = await owner.mutation(api.identity.createInvitation, args);
    const replay = await owner.mutation(api.identity.createInvitation, args);
    expect(replay).toMatchObject({
      invitationId: first.invitationId,
      token: null,
      replayed: true,
    });
    const row = await t.run((ctx) => ctx.db.get(first.invitationId));
    expect(row?.tokenHash).not.toBe(first.token);
    expect(row?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      owner.mutation(api.identity.createInvitation, {
        ...args,
        requestKey: "other-request-key",
      }),
    ).rejects.toThrow("INVITATION_ALREADY_PENDING");
    await expect(
      owner.mutation(api.identity.createInvitation, {
        ...args,
        email: "changed@example.com",
      }),
    ).rejects.toThrow("REQUEST_KEY_REUSED");
  });
  test("employee joins with assigned permissions; replay succeeds once without duplicate membership/audit", async () => {
    const { t, employee, a, invite } = await fixture();
    const invitation = await invite();
    const token = invitation.token!;
    const workspace = await employee.mutation(api.identity.acceptInvitation, {
      token,
    });
    expect(workspace.membership.roleKey).toBe("EMPLOYEE");
    expect(workspace.permissions).not.toContain("employee.manage");
    expect(
      (await employee.mutation(api.identity.acceptInvitation, { token }))
        .membership.id,
    ).toBe(workspace.membership.id);
    const audits = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_agency_time", (q) => q.eq("agencyId", a.agency.id))
        .collect(),
    );
    expect(
      audits.filter((x) => x.action === "agency.invitation.accepted"),
    ).toHaveLength(1);
  });
  test("wrong email, unverified email and forged token cannot join", async () => {
    const { t, outsider, employee, invite } = await fixture();
    const token = (await invite()).token!;
    await expect(
      outsider.mutation(api.identity.acceptInvitation, { token }),
    ).rejects.toThrow("INVITATION_EMAIL_MISMATCH");
    await expect(
      t
        .withIdentity(identity("employee", false))
        .mutation(api.identity.acceptInvitation, { token }),
    ).rejects.toThrow("EMAIL_NOT_VERIFIED");
    await expect(
      employee.mutation(api.identity.acceptInvitation, {
        token: "f".repeat(64),
      }),
    ).rejects.toThrow("INVITATION_INVALID");
    expect(await employee.query(api.identity.listAgencies, {})).toEqual([]);
  });
  test("expired and revoked invitations are denied", async () => {
    const { t, employee, invite } = await fixture();
    const invitation = await invite();
    await t.run((ctx) =>
      ctx.db.patch(invitation.invitationId, { expiresAt: Date.now() - 1 }),
    );
    await expect(
      employee.mutation(api.identity.acceptInvitation, {
        token: invitation.token!,
      }),
    ).rejects.toThrow("INVITATION_EXPIRED");
    await t.run((ctx) =>
      ctx.db.patch(invitation.invitationId, { status: "revoked" }),
    );
    await expect(
      employee.mutation(api.identity.acceptInvitation, {
        token: invitation.token!,
      }),
    ).rejects.toThrow("INVITATION_INVALID");
  });
  test("lower roles cannot invite, grant themselves privileges or revoke an owner", async () => {
    const { employee, a, employeeUser, ownerUser, invite } = await fixture();
    await employee.mutation(api.identity.acceptInvitation, {
      token: (await invite()).token!,
    });
    await expect(
      employee.mutation(api.identity.createInvitation, {
        agencyId: a.agency.id,
        email: "friend@example.com",
        roleKey: "EMPLOYEE",
        requestKey: "employee-invite",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      employee.mutation(api.identity.updateMemberRole, {
        agencyId: a.agency.id,
        userId: employeeUser.id,
        roleKey: "AGENCY_OWNER",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      employee.mutation(api.identity.revokeMembership, {
        agencyId: a.agency.id,
        userId: ownerUser.id,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  });
  test("admins cannot grant ownership or change/revoke existing owners", async () => {
    const { employee, a, ownerUser, invite } = await fixture();
    await employee.mutation(api.identity.acceptInvitation, {
      token: (await invite("AGENCY_ADMIN")).token!,
    });
    await expect(
      employee.mutation(api.identity.createInvitation, {
        agencyId: a.agency.id,
        email: "x@example.com",
        roleKey: "AGENCY_OWNER",
        requestKey: "admin-grant-owner",
      }),
    ).rejects.toThrow("ROLE_GRANT_DENIED");
    await expect(
      employee.mutation(api.identity.updateMemberRole, {
        agencyId: a.agency.id,
        userId: ownerUser.id,
        roleKey: "EMPLOYEE",
      }),
    ).rejects.toThrow(/OWNER_ONLY|LAST_OWNER_PROTECTED/);
    await expect(
      employee.mutation(api.identity.revokeMembership, {
        agencyId: a.agency.id,
        userId: ownerUser.id,
      }),
    ).rejects.toThrow("OWNER_ONLY");
  });
  test("last owner cannot be demoted or revoked", async () => {
    const { owner, a, ownerUser } = await fixture();
    await expect(
      owner.mutation(api.identity.updateMemberRole, {
        agencyId: a.agency.id,
        userId: ownerUser.id,
        roleKey: "EMPLOYEE",
      }),
    ).rejects.toThrow("LAST_OWNER_PROTECTED");
    await expect(
      owner.mutation(api.identity.revokeMembership, {
        agencyId: a.agency.id,
        userId: ownerUser.id,
      }),
    ).rejects.toThrow("LAST_OWNER_PROTECTED");
  });
  test("role changes update access and revoked membership stays revoked on invitation replay", async () => {
    const { owner, employee, a, employeeUser, invite } = await fixture();
    const token = (await invite("AGENCY_ADMIN")).token!;
    await employee.mutation(api.identity.acceptInvitation, { token });
    await owner.mutation(api.identity.updateMemberRole, {
      agencyId: a.agency.id,
      userId: employeeUser.id,
      roleKey: "EMPLOYEE",
    });
    expect(
      (
        await employee.query(api.identity.getWorkspace, {
          agencyId: a.agency.id,
        })
      )?.permissions,
    ).not.toContain("employee.manage");
    await owner.mutation(api.identity.revokeMembership, {
      agencyId: a.agency.id,
      userId: employeeUser.id,
    });
    expect(
      await employee.query(api.identity.getWorkspace, {
        agencyId: a.agency.id,
      }),
    ).toBeNull();
    expect(await employee.query(api.identity.listAgencies, {})).toEqual([]);
    await expect(
      employee.mutation(api.identity.acceptInvitation, { token }),
    ).rejects.toThrow("AGENCY_ACCESS_DENIED");
  });
  test("inviter revocation prevents acceptance", async () => {
    const { t, owner, employee, a, invite } = await fixture();
    await employee.mutation(api.identity.acceptInvitation, {
      token: (await invite("AGENCY_ADMIN")).token!,
    });
    const pending = await employee.mutation(api.identity.createInvitation, {
      agencyId: a.agency.id,
      email: "new@example.com",
      roleKey: "EMPLOYEE",
      requestKey: "admin-invitation",
    });
    const member = await employee.query(api.identity.getCurrentUser, {});
    await owner.mutation(api.identity.revokeMembership, {
      agencyId: a.agency.id,
      userId: member!.id,
    });
    const newcomer = t.withIdentity(identity("new"));
    await newcomer.mutation(api.identity.ensureCurrentUser, {});
    await expect(
      newcomer.mutation(api.identity.acceptInvitation, {
        token: pending.token!,
      }),
    ).rejects.toThrow("INVITATION_REVOKED");
  });
  test("membership permissions are specific to each agency", async () => {
    const { owner, outsider, a, b } = await fixture();
    const invitation = await outsider.mutation(api.identity.createInvitation, {
      agencyId: b.agency.id,
      email: "owner@example.com",
      roleKey: "READ_ONLY",
      requestKey: "multi-agency-user",
    });
    await owner.mutation(api.identity.acceptInvitation, {
      token: invitation.token!,
    });
    expect(
      (await owner.query(api.identity.getWorkspace, { agencyId: a.agency.id }))
        ?.membership.roleKey,
    ).toBe("AGENCY_OWNER");
    expect(
      (await owner.query(api.identity.getWorkspace, { agencyId: b.agency.id }))
        ?.membership.roleKey,
    ).toBe("READ_ONLY");
  });
});

test("role map never grants platform permissions or crashes on an unknown role", () => {
  for (const role of roleKeys)
    expect(hasPermission(role, "platform.admin")).toBe(false);
  expect(hasPermission("UNKNOWN", "vehicle.read")).toBe(false);
  expect(canGrantRole("UNKNOWN", "EMPLOYEE")).toBe(false);
  expect(canGrantRole("AGENCY_OWNER", "UNKNOWN")).toBe(false);
  expect(hasPermission("constructor", "vehicle.read")).toBe(false);
});
