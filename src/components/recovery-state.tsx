import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { CommonMessages } from "@/i18n/messages";

export function RecoveryState({
  title,
  description,
  reset,
  reference,
  labels,
}: {
  title: string;
  description: string;
  reset?: () => void;
  reference?: string;
  labels: CommonMessages["recovery"];
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-24">
      <p
        lang="en"
        dir="ltr"
        className="mb-4 text-start text-xs font-semibold tracking-widest text-primary uppercase"
      >
        Car Rental
      </p>
      <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        {description}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {reset && (
          <Button onClick={reset} className="min-h-11 rounded-full px-6">
            {labels.retry}
          </Button>
        )}
        <Button
          asChild
          variant={reset ? "outline" : "default"}
          className="min-h-11 rounded-full px-6"
        >
          <Link href="/">{labels.home}</Link>
        </Button>
      </div>
      {reference && (
        <p className="mt-6 text-xs text-muted-foreground">
          {labels.reference}: <bdi dir="ltr">{reference}</bdi>
        </p>
      )}
    </div>
  );
}
