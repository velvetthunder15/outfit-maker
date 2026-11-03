// Route skeletons: static shapes with a single CSS shimmer (opacity pulse), no JS.
export function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl bg-blue/10 om-pulse ${className}`} />;
}

export function HeadingSkeleton({ width = "w-64" }: { width?: string }) {
  return <Bar className={`h-14 sm:h-20 ${width} max-w-full`} />;
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="rounded-[22px] bg-paper border border-blue/10 overflow-hidden">
          <Bar className="h-28 !rounded-none" />
          <div className="p-4 space-y-2">
            <Bar className="h-4 w-3/4" />
            <Bar className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TileGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <Bar className="aspect-[4/5] !rounded-2xl" />
          <Bar className="mt-2 h-3 w-2/3" />
        </li>
      ))}
    </ul>
  );
}

export function PageSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="pt-8" role="status" aria-label="Loading">
      {children}
    </div>
  );
}
