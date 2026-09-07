import { Skeleton } from "@/components/ui/skeleton";
import { getI18n } from "@/i18n/server";

export default async function Loading() {
  const { messages } = await getI18n();
  return (
    <div role="status" className="studio-hero">
      <span className="sr-only">{messages.common.loading}</span>
      <div
        aria-hidden="true"
        className="hero-copy flex flex-col items-center gap-7"
      >
        <Skeleton className="size-20 rounded-3xl sm:size-24" />
        <Skeleton className="h-20 w-full max-w-3xl sm:h-44" />
        <Skeleton className="h-16 w-full max-w-lg" />
        <div className="flex flex-wrap justify-center gap-3">
          <Skeleton className="h-12 w-44 rounded-full" />
          <Skeleton className="h-12 w-36 rounded-full" />
        </div>
      </div>
    </div>
  );
}
