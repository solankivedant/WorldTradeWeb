import { PageHeadSkeleton, Shimmer, StatRowSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <PageHeadSkeleton what="country dashboard" />
      <div className="mt-4">
        <StatRowSkeleton />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Shimmer className="h-72" />
        <Shimmer className="h-72" />
      </div>
      <Shimmer className="mt-3 h-64" />
    </div>
  );
}
