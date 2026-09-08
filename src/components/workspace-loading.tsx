import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type WorkspaceLoadingProps = {
  label: string;
  variant?: "page" | "card" | "inline";
  className?: string;
};

export function WorkspaceLoading({
  label,
  variant = "page",
  className,
}: WorkspaceLoadingProps) {
  return (
    <div
      className={cn(
        "workspace-loading-ui",
        `workspace-loading-${variant}`,
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      <div className="workspace-loading-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="workspace-loading-skeleton" aria-hidden="true">
        <div className="workspace-loading-skeleton-topline">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-8 w-3/5 max-w-80" />
        <Skeleton className="h-4 w-4/5 max-w-[28rem]" />
        <div className="workspace-loading-panels">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
