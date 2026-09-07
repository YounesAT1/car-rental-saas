import { CarTaxiFront } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground",
          compact ? "size-8" : "size-10",
        )}
      >
        <CarTaxiFront
          className={compact ? "size-4" : "size-5"}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </span>
      <span
        lang="en"
        dir="ltr"
        className={cn(
          "brand-wordmark font-display font-semibold tracking-[-0.045em]",
          compact ? "text-base" : "text-lg",
        )}
      >
        Car Rental
      </span>
    </span>
  );
}
