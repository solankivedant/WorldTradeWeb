import { CardGridSkeleton, PageHeadSkeleton, Shimmer } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
      <PageHeadSkeleton what="opportunities" />
      <Shimmer className="mt-4 h-[72px]" />
      <Shimmer className="mt-3 h-16" />
      <div className="mt-3">
        <CardGridSkeleton count={9} height="h-52" />
      </div>
    </div>
  );
}
