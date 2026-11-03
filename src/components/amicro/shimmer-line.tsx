"use client";
// Amicro: loading/shimmer-line (MIT)
import { motion } from "motion/react";

export const ShimmerLine = ({ className = "w-24" }: { className?: string }) => (
  <div className={`h-1 bg-blue/15 rounded-full overflow-hidden relative ${className}`}>
    <motion.div
      className="absolute top-0 left-0 bottom-0 w-1/3 bg-coral rounded-full"
      animate={{ x: ["-100%", "300%"] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
  </div>
);
