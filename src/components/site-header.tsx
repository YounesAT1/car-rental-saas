import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthActions } from "@/components/auth-actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SiteHeaderShell } from "@/components/site-header-shell";
import { getI18n } from "@/i18n/server";

export async function SiteHeader() {
  const {
    messages: { common },
  } = await getI18n();
  return (
    <SiteHeaderShell>
      <Link href="/" aria-label={common.homeLabel} className="brand-link">
        <Brand compact />
      </Link>
      <div className="header-controls">
        <AuthActions />
        <LanguageSwitcher />
      </div>
    </SiteHeaderShell>
  );
}
