import { PageHeadSkeleton, Shimmer } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 lg:px-6">
      <PageHeadSkeleton what="the data record" />
      <Shimmer className="mt-4 h-28" />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Shimmer className="h-48" />
        <Shimmer className="h-48" />
      </div>
      <Shimmer className="mt-3 h-64" />
    </div>
  );
}
