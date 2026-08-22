import { PageHeadSkeleton, Shimmer, StatRowSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
      <PageHeadSkeleton what="tariff schedules" />
      <div className="mt-4">
        <StatRowSkeleton />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Shimmer className="h-56 lg:col-span-2" />
        <Shimmer className="h-56" />
      </div>
      <Shimmer className="mt-3 h-96" />
    </div>
  );
}
