import type React from "react";
// Amicro: ai/ai-prompt-chips (MIT) — adapted to a single/multi-select chip group.
// Perf rewrite: CSS entrance stagger + CSS hover/tap (hover lift only on hover-capable devices via Tailwind v4 `hover:`).
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
          <button
            key={chip.id}
            type="button"
            aria-pressed={active}
            title={chip.hint}
            style={{ "--om-d": "0.25s", "--om-delay": `${Math.min(index * 0.03, 0.4)}s`, "--om-y": "8px" } as React.CSSProperties}
            onClick={() => {
              if (multiple) onChange(active ? value.filter((v) => v !== chip.id) : [...value, chip.id]);
              else onChange(active ? [] : [chip.id]);
            }}
            className={`om-fade-up inline-flex items-center gap-1.5 rounded-full font-medium border cursor-pointer touch-manipulation transition-[translate,scale,background-color,border-color,color] duration-200 hover:-translate-y-0.5 active:scale-95 ${pad} ${
              active
                ? "bg-blue text-ivory border-blue shadow-[0_6px_16px_-10px_rgba(23,71,109,0.9)]"
                : "bg-paper/70 text-ink border-blue/20 hover:border-blue/50 hover:bg-paper"
            }`}
          >
            {chip.icon && <span aria-hidden>{chip.icon}</span>}
            <span>{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
}
