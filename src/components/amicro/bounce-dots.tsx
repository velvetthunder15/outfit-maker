// Amicro: loading/bounce-dots (MIT) — perf rewrite: CSS keyframes on transform (runs on the compositor).
export const BounceDots = ({ className = "bg-coral" }: { className?: string }) => (
  <div className="flex space-x-1.5" role="status" aria-label="Loading">
    {[0, 1, 2].map((i) => (
      <div key={i} className={`w-2.5 h-2.5 rounded-full om-bounce ${className}`} style={{ animationDelay: `${i * 0.1}s` }} />
    ))}
  </div>
);
