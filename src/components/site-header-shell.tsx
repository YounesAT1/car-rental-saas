"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const BOTTOM_THRESHOLD = 96;

export function SiteHeaderShell({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const updateHeaderState = () => {
      const { documentElement } = document;
      const hasScrollableContent =
        documentElement.scrollHeight > window.innerHeight + BOTTOM_THRESHOLD;
      const isNearBottom =
        window.scrollY + window.innerHeight >=
        documentElement.scrollHeight - BOTTOM_THRESHOLD;

      setIsExpanded(hasScrollableContent && isNearBottom);
    };

    updateHeaderState();
    window.addEventListener("scroll", updateHeaderState, { passive: true });
    window.addEventListener("resize", updateHeaderState);

    return () => {
      window.removeEventListener("scroll", updateHeaderState);
      window.removeEventListener("resize", updateHeaderState);
    };
  }, []);

  return (
    <header
      className={cn("site-header", isExpanded && "site-header-expanded")}
      data-expanded={isExpanded}
    >
      {children}
    </header>
  );
}
