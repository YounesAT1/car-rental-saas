"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const BOTTOM_THRESHOLD = 96;

export function SiteHeaderShell({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldReduceMotion = useReducedMotion();

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
      <motion.div
        layout={!shouldReduceMotion}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }
        }
        className="header-inner"
      >
        {children}
      </motion.div>
    </header>
  );
}
