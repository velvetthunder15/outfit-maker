"use client";
// Amicro: text/text-reveal (MIT) — lines can carry their own className
import React from "react";
import { motion } from "motion/react";

export function TextReveal({ lines, duration = 0.9, staggerDelay = 0.12, className = "" }: { lines: { text: string; className?: string }[]; duration?: number; staggerDelay?: number; className?: string }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 1 }, visible: { opacity: 1, transition: { staggerChildren: staggerDelay } } }}
      initial="hidden"
      animate="visible"
      className={`flex flex-col ${className}`}
    >
      {lines.map((line, i) => (
        <div key={i} className="overflow-hidden">
          <motion.span
            variants={{ hidden: { y: "105%" }, visible: { y: 0, transition: { duration, ease: [0.16, 1, 0.3, 1] } } }}
            className={`block ${line.className ?? ""}`}
          >
            {line.text}
          </motion.span>
        </div>
      ))}
    </motion.div>
  );
}
