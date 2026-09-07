import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { getI18n } from "@/i18n/server";

export async function SiteFooter() {
  const {
    messages: { common },
  } = await getI18n();
  return (
    <footer className="site-footer">
      <div className="studio-container footer-inner">
        <Link href="/" aria-label={common.homeLabel} className="brand-link">
          <Brand compact />
        </Link>
        <p>{common.footer}</p>
        <Link href="/#platform" className="footer-link">
          {common.explore}
          <ArrowUpRight
            className="directional-icon size-4"
            aria-hidden="true"
          />
        </Link>
      </div>
    </footer>
  );
}
