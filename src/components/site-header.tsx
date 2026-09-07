import Link from "next/link";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SiteHeaderShell } from "@/components/site-header-shell";
import { getI18n } from "@/i18n/server";

export async function SiteHeader() {
  const {
    messages: { common },
  } = await getI18n();
  return (
    <SiteHeaderShell>
      <div className="header-inner">
        <Link href="/" aria-label={common.homeLabel} className="brand-link">
          <Brand compact monochrome />
        </Link>
        <div className="header-controls">
          <LanguageSwitcher />
        </div>
      </div>
    </SiteHeaderShell>
  );
}
