"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { IdentitySync } from "@/components/identity-sync";

export function Providers({
  children,
  convexUrl,
}: {
  children: ReactNode;
  convexUrl: string;
}) {
  const [convex] = useState(() => new ConvexReactClient(convexUrl));
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={["light", "dark"]}
      disableTransitionOnChange
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <IdentitySync>{children}</IdentitySync>
      </ConvexProviderWithClerk>
    </ThemeProvider>
  );
}
