// Amicro: loading/shimmer-line (MIT) — perf rewrite: CSS keyframes on transform.
export const ShimmerLine = ({ className = "w-24" }: { className?: string }) => (
  <div className={`h-1 bg-blue/15 rounded-full overflow-hidden relative ${className}`}>
    <div className="absolute top-0 left-0 bottom-0 w-1/3 bg-coral rounded-full om-shimmer" />
  </div>
);
