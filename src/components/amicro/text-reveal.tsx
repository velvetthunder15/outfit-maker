// Amicro: text/text-reveal (MIT) — perf rewrite: CSS keyframes (transform only), server-renderable.
import React from "react";

export function TextReveal({ lines, duration = 0.9, staggerDelay = 0.12, className = "" }: { lines: { text: string; className?: string }[]; duration?: number; staggerDelay?: number; className?: string }) {
  return (
    <div className={`flex flex-col ${className}`} aria-hidden>
      {lines.map((line, i) => (
        <div key={i} className="overflow-hidden">
          <span
            className={`block om-reveal ${line.className ?? ""}`}
            style={{ "--om-d": `${duration}s`, "--om-delay": `${i * staggerDelay}s` } as React.CSSProperties}
          >
            {line.text}
          </span>
        </div>
      ))}
    </div>
  );
}
