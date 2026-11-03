"use client";
// Amicro: hover/magnetic-button (MIT) — perf rewrite: no motion runtime. Magnetic pull only for a mouse
// (pointerType "mouse"), rAF-throttled, transform-only; tap feedback is a CSS :active scale.
import React, { useRef } from "react";

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  range?: number;
  strength?: number;
  variant?: "coral" | "blue" | "ghost";
}

const variants = {
  coral: "bg-coral text-blue-ink hover:bg-[#f39469] shadow-[0_6px_14px_-8px_rgba(217,105,58,0.55)]",
  blue: "bg-blue text-ivory hover:bg-blue-deep shadow-[0_10px_24px_-12px_rgba(23,71,109,0.8)]",
  ghost: "bg-transparent text-blue border-[1.5px] border-blue/75 hover:border-blue hover:bg-blue/5",
};

export function MagneticButton({ children, range = 60, strength = 0.3, className = "", variant = "coral", ...rest }: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const frame = useRef(0);
  const move = (tx: number, ty: number) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (ref.current) ref.current.style.translate = tx || ty ? `${tx}px ${ty}px` : "";
    });
  };
  return (
    <button
      ref={ref}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || !ref.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const { left, top, width, height } = ref.current.getBoundingClientRect();
        const cx = left + width / 2;
        const cy = top + height / 2;
        if (Math.hypot(e.clientX - cx, e.clientY - cy) < range + width / 2) move((e.clientX - cx) * strength, (e.clientY - cy) * strength);
        else move(0, 0);
      }}
      onPointerLeave={() => move(0, 0)}
      className={`relative inline-flex items-center justify-center gap-2 rounded-full font-semibold text-sm h-12 px-7 transition-[translate,scale,background-color,border-color] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.95] active:duration-100 cursor-pointer select-none touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      <span className="relative z-10 inline-flex items-center gap-2 pointer-events-none">{children}</span>
    </button>
  );
}
