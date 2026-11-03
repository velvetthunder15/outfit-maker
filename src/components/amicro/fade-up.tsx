// Amicro: entrance/fade-up (MIT) — perf rewrite: pure CSS keyframe (compositor-only opacity + transform),
// server-renderable, no JS/hydration needed, honours prefers-reduced-motion via globals.css.
import React from "react";

export function FadeUp({
  children, duration = 0.6, delay = 0, yOffset = 16, className = "", fade = true,
}: { children: React.ReactNode; duration?: number; delay?: number; yOffset?: number; className?: string; fade?: boolean }) {
  return (
    <div
      className={`${fade ? "om-fade-up" : "om-rise"} ${className}`}
      style={{ "--om-d": `${duration}s`, "--om-delay": `${delay}s`, "--om-y": `${yOffset}px` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
