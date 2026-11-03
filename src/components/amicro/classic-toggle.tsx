"use client";
// Amicro: toggles/classic-toggle (MIT) — controlled + labelled
import { motion } from "motion/react";

export const ClassicToggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    className={`relative w-14 h-8 shrink-0 rounded-full p-1 transition-colors duration-300 cursor-pointer ${on ? "bg-coral" : "bg-blue/25"}`}
  >
    <motion.div
      animate={{ x: on ? 24 : 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="w-6 h-6 bg-paper rounded-full shadow-[0_2px_6px_rgba(15,47,73,0.25)]"
    />
  </button>
);
