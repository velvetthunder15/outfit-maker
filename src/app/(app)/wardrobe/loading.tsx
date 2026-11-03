import { Bar, HeadingSkeleton, PageSkeleton, TileGridSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeadingSkeleton width="w-72" />
      <Bar className="mt-3 h-4 w-80 max-w-full" />
      <Bar className="mt-8 h-24 !rounded-[22px]" />
      <TileGridSkeleton />
    </PageSkeleton>
  );
}
