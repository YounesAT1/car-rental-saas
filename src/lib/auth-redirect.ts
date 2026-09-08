export function invitationReturnPath(token: string | string[] | undefined) {
  const value = Array.isArray(token) ? token[0] : token;
  return value && /^[a-f0-9]{64}$/.test(value)
    ? `/invitations/accept?${new URLSearchParams({ token: value })}`
    : "/invitations/accept";
}

export function safeReturnPath(value: string | string[] | undefined) {
  if (typeof value !== "string") return "/onboarding";
  if (
    value === "/onboarding" ||
    value === "/agencies/select" ||
    value === "/invitations/accept"
  )
    return value;
  if (/^\/app\/[a-z0-9]+$/.test(value)) return value;
  if (value.startsWith("/invitations/accept?")) {
    return invitationReturnPath(
      new URL(value, "https://app.invalid").searchParams.get("token") ??
        undefined,
    );
  }
  return "/onboarding";
}

export function signInPath(returnPath: string) {
  return `/sign-in?${new URLSearchParams({ redirect_url: safeReturnPath(returnPath) })}`;
}
