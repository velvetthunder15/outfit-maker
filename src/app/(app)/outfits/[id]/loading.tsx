import { Bar, HeadingSkeleton, PageSkeleton, TileGridSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeadingSkeleton width="w-[36rem]" />
      <Bar className="mt-4 h-5 w-96 max-w-full" />
      <div className="mt-6 flex gap-2"><Bar className="h-11 w-28 !rounded-full" /><Bar className="h-11 w-24 !rounded-full" /></div>
      <TileGridSkeleton count={5} />
    </PageSkeleton>
  );
}
