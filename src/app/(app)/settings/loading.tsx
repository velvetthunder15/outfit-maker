import { Bar, HeadingSkeleton, PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="max-w-2xl">
        <HeadingSkeleton width="w-60" />
        <Bar className="mt-3 h-4 w-56" />
        {[0, 1, 2, 3].map((i) => <Bar key={i} className="mt-6 h-24 !rounded-[22px]" />)}
      </div>
    </PageSkeleton>
  );
}
