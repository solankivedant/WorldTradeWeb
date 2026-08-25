import { PageHeadSkeleton, Shimmer, StatRowSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
      <PageHeadSkeleton what="supply and demand" />
      <Shimmer className="mt-4 h-[74px]" />
      <div className="mt-3">
        <StatRowSkeleton />
      </div>
      {/* Mirrors the 3/2 split the explorer lands in, so nothing jumps sideways. */}
      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <Shimmer className="h-[520px] lg:col-span-3" />
        <Shimmer className="h-[520px] lg:col-span-2" />
      </div>
      <Shimmer className="mt-3 h-72" />
    </div>
  );
}
