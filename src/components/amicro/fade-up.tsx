"use client";
// Amicro: entrance/fade-up (MIT)
import React from "react";
import { motion } from "motion/react";

export function FadeUp({ children, duration = 0.6, delay = 0, yOffset = 16, className = "" }: { children: React.ReactNode; duration?: number; delay?: number; yOffset?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: yOffset }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
