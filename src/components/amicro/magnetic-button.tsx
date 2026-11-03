"use client";
// Amicro: hover/magnetic-button (MIT) — restyled
import React, { useRef } from "react";
import { motion, useSpring, useReducedMotion } from "motion/react";

interface MagneticButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"> {
  children: React.ReactNode;
  range?: number;
  strength?: number;
  variant?: "coral" | "blue" | "ghost";
}

const variants = {
  coral: "bg-coral text-blue-ink hover:bg-[#f39469] shadow-[0_10px_24px_-12px_rgba(217,105,58,0.8)]",
  blue: "bg-blue text-ivory hover:bg-blue-deep shadow-[0_10px_24px_-12px_rgba(23,71,109,0.8)]",
  ghost: "bg-transparent text-blue border border-blue/40 hover:border-blue",
};

export function MagneticButton({ children, range = 60, strength = 0.3, className = "", variant = "coral", ...rest }: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const springConfig = { stiffness: 150, damping: 15, mass: 0.6 };
  const x = useSpring(0, springConfig);
  const y = useSpring(0, springConfig);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current || reduce) return;
    const { left, top, width, height } = ref.current.getBoundingClientRect();
    const cx = left + width / 2;
    const cy = top + height / 2;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    if (dist < range + width / 2) {
      x.set((e.clientX - cx) * strength);
      y.set((e.clientY - cy) * strength);
    } else {
      x.set(0);
      y.set(0);
    }
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={reset}
      whileTap={{ scale: 0.96 }}
      style={{ x, y }}
      className={`relative inline-flex items-center justify-center gap-2 rounded-full font-semibold text-sm h-12 px-7 transition-colors duration-200 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      <span className="relative z-10 inline-flex items-center gap-2 pointer-events-none">{children}</span>
    </motion.button>
  );
}
