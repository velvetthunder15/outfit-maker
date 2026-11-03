"use client";
// Amicro: hover/tilt-card (MIT) — perf rewrite: no motion runtime. Only active for a fine pointer that can hover
// (mouse/trackpad); on touch it is a plain wrapper, so scrolling on phones never triggers 3D transforms.
// Writes one transform per animation frame (rAF-throttled), CSS transition does the easing.
import React, { useEffect, useRef, useState } from "react";

export function TiltCard({ children, maxTilt = 8, className = "" }: { children: React.ReactNode; maxTilt?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => {
      mq.removeEventListener("change", update);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  if (!enabled) return <div className={className}>{children}</div>;
  const set = (rx: number, ry: number) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (ref.current) ref.current.style.transform = rx || ry ? `rotateX(${rx}deg) rotateY(${ry}deg)` : "";
    });
  };
  return (
    <div style={{ perspective: 1000 }} className={className}>
      <div
        ref={ref}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse" || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          set(-y * 2 * maxTilt, x * 2 * maxTilt);
        }}
        onPointerEnter={() => ref.current && (ref.current.style.willChange = "transform")}
        onPointerLeave={() => {
          set(0, 0);
          if (ref.current) ref.current.style.willChange = "";
        }}
        className="h-full w-full transition-transform duration-300 ease-[var(--ease-out-expo)]"
      >
        {children}
      </div>
    </div>
  );
}
