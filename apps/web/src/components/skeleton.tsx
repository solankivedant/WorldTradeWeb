import { Loader2 } from "lucide-react";

/**
 * Route skeletons.
 *
 * These render the SHAPE of the page that is arriving - a title block, a filter row, a
 * grid of the right density - rather than a centered spinner. A spinner tells the reader
 * that something is happening; a skeleton tells them what is happening, and stops the
 * layout jumping when the real content lands.
 *
 * Server-rendered, no client boundary: they never do anything but occupy space.
 */

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-raised ${className}`} aria-hidden />;
}

export function LoadingLabel({ what }: { what: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-muted" role="status">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      Loading {what}...
    </p>
  );
}

export function PageHeadSkeleton({ what }: { what: string }) {
  return (
    <div className="space-y-3">
      <Shimmer className="h-3 w-40" />
      <Shimmer className="h-7 w-72" />
      <Shimmer className="h-4 w-full max-w-xl" />
      <LoadingLabel what={what} />
    </div>
  );
}

export function CardGridSkeleton({ count = 6, height = "h-44" }: { count?: number; height?: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Shimmer key={i} className={height} />
      ))}
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Shimmer key={i} className="h-[86px]" />
      ))}
    </div>
  );
}
