import { expect, test } from "vitest";
import {
  invitationReturnPath,
  safeReturnPath,
  signInPath,
} from "../src/lib/auth-redirect";

test("invitation token survives sign-in and sign-up return URLs", () => {
  const token = "a".repeat(64);
  const target = invitationReturnPath(token);
  const redirect = new URL(
    signInPath(target),
    "https://app.invalid",
  ).searchParams.get("redirect_url");
  expect(redirect).toBe(`/invitations/accept?token=${token}`);
  expect(safeReturnPath(redirect!)).toBe(target);
});

test.each([
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "javascript:alert(1)",
  ["/onboarding", "https://evil.example"],
  undefined,
])("rejects unsafe return destination %s", (input) => {
  expect(safeReturnPath(input)).toBe("/onboarding");
});

test("rejects invalid invitation token and drops unrelated return query arguments", () => {
  expect(invitationReturnPath("invalid")).toBe("/invitations/accept");
  expect(
    safeReturnPath(
      `/invitations/accept?token=${"b".repeat(64)}&next=https://evil.example`,
    ),
  ).toBe(`/invitations/accept?token=${"b".repeat(64)}`);
});
