"use client";
// Amicro: ai/ai-prompt-chips (MIT) — adapted to a single/multi-select chip group
import { motion } from "motion/react";

export type Chip = { id: string; label: string; icon?: string; hint?: string };

export function PromptChips({
  chips, value, onChange, multiple = false, size = "md",
}: { chips: Chip[]; value: string[]; onChange: (v: string[]) => void; multiple?: boolean; size?: "sm" | "md" | "lg" }) {
  const pad = size === "lg" ? "px-4 py-2.5 text-[0.95rem]" : size === "sm" ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip, index) => {
        const active = value.includes(chip.id);
        return (
          <motion.button
            key={chip.id}
            type="button"
            aria-pressed={active}
            title={chip.hint}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.25 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (multiple) onChange(active ? value.filter((v) => v !== chip.id) : [...value, chip.id]);
              else onChange(active ? [] : [chip.id]);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full font-medium border cursor-pointer transition-colors duration-200 ${pad} ${
              active
                ? "bg-blue text-ivory border-blue shadow-[0_6px_16px_-10px_rgba(23,71,109,0.9)]"
                : "bg-paper/70 text-ink border-blue/20 hover:border-blue/50 hover:bg-paper"
            }`}
          >
            {chip.icon && <span aria-hidden>{chip.icon}</span>}
            <span>{chip.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
