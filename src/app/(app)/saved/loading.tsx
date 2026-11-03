import { Bar, CardGridSkeleton, HeadingSkeleton, PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeadingSkeleton width="w-72" />
      <div className="mt-5 flex gap-2"><Bar className="h-11 w-24 !rounded-full" /><Bar className="h-11 w-24 !rounded-full" /></div>
      <CardGridSkeleton />
    </PageSkeleton>
  );
}
