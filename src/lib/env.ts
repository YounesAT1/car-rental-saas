function required(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(
      `Missing ${name}. Configure .env.local using .env.example.`,
    );
  }
  return value.trim();
}

export function readPublicEnvironment() {
  const clerkPublishableKey = required(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  );
  if (!/^pk_(test|live)_[A-Za-z0-9_-]+$/.test(clerkPublishableKey)) {
    throw new Error(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a real Clerk publishable key.",
    );
  }

  const convexUrl = required(
    process.env.NEXT_PUBLIC_CONVEX_URL,
    "NEXT_PUBLIC_CONVEX_URL",
  );
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(convexUrl);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL must be an absolute HTTPS deployment URL.",
    );
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL must be an HTTPS deployment URL without credentials.",
    );
  }

  return { clerkPublishableKey, convexUrl };
}
