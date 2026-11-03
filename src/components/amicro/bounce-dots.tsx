"use client";
// Amicro: loading/bounce-dots (MIT)
import { motion } from "motion/react";

export const BounceDots = ({ className = "bg-coral" }: { className?: string }) => (
  <div className="flex space-x-1.5" role="status" aria-label="Loading">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className={`w-2.5 h-2.5 rounded-full ${className}`}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
      />
    ))}
  </div>
);
