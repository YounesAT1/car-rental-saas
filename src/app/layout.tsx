import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { readPublicEnvironment } from "@/lib/env";
import { I18nProvider } from "@/i18n/client";
import { getClerkLocalization, getI18n } from "@/i18n/server";
import { fontClasses } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await getI18n();
  return {
    title: { default: messages.metadata.title, template: "%s | Car Rental" },
    description: messages.metadata.description,
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { clerkPublishableKey, convexUrl } = readPublicEnvironment();
  const { locale, direction, messages } = await getI18n();
  const localization = await getClerkLocalization();
  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <body className={fontClasses}>
        <ClerkProvider
          publishableKey={clerkPublishableKey}
          localization={localization}
          appearance={{ theme: shadcn }}
        >
          <I18nProvider locale={locale} messages={messages.common}>
            <Providers convexUrl={convexUrl}>
              <a href="#main-content" className="skip-link">
                {messages.common.skipLink}
              </a>
              <div className="flex min-h-svh flex-col">
                <SiteHeader />
                <main
                  id="main-content"
                  tabIndex={-1}
                  className="flex flex-1 flex-col outline-none"
                >
                  {children}
                </main>
                <SiteFooter />
              </div>
              <div className="floating-controls">
                <ThemeToggle />
              </div>
            </Providers>
          </I18nProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
