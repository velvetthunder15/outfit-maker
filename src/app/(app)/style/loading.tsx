import { Bar, HeadingSkeleton, PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <HeadingSkeleton width="w-80" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-8 space-y-4">
              <Bar className="h-6 w-48" />
              <div className="flex flex-wrap gap-2">{[0, 1, 2, 3, 4].map((j) => <Bar key={j} className="h-10 w-24 !rounded-full" />)}</div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <Bar className="h-[132px] !rounded-[22px]" />
          <Bar className="h-48 !rounded-[22px]" />
        </div>
      </div>
    </PageSkeleton>
  );
}
