"use client";
// Thumb-friendly bottom action list (a centred card on desktop). transform/opacity-only motion.
import { useEffect } from "react";
import { AnimatePresence, m } from "motion/react";
import type { LucideIcon } from "lucide-react";

export type SheetAction = { id: string; label: string; desc?: string; icon: LucideIcon; danger?: boolean; disabled?: boolean };

export function ActionSheet({ open, title, subtitle, actions, onPick, onClose }: { open: boolean; title: string; subtitle?: string; actions: SheetAction[]; onPick: (id: string) => void; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div key="scrim" className="fixed inset-0 z-[55] bg-blue-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} />
          <m.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed z-[56] inset-x-0 bottom-0 md:inset-x-auto md:left-1/2 md:bottom-auto md:top-1/2 md:w-[380px] md:-translate-x-1/2 md:-translate-y-1/2 rounded-t-[28px] md:rounded-[24px] bg-ivory px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-20px_60px_-20px_rgba(15,47,73,0.5)]"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-blue/20 md:hidden" />
            <div className="px-3 pb-2">
              <p className="text-base font-semibold text-blue truncate">{title}</p>
              {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
            </div>
            <ul>
              {actions.map((a) => (
                <li key={a.id}>
                  <button
                    disabled={a.disabled}
                    onClick={() => onPick(a.id)}
                    className={`w-full min-h-14 flex items-center gap-3.5 rounded-2xl px-3 py-2 text-left transition-[background-color,scale] duration-150 active:scale-[0.98] motion-reduce:transition-none hover:bg-blue/[0.06] disabled:opacity-40 ${a.danger ? "text-coral-deep" : "text-ink"}`}
                  >
                    <span className={`h-10 w-10 shrink-0 grid place-items-center rounded-full ${a.danger ? "bg-coral/15" : "bg-blue/10 text-blue"}`}>
                      <a.icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.95rem] font-medium">{a.label}</span>
                      {a.desc && <span className="block text-xs text-muted">{a.desc}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={onClose} className="mt-1 w-full h-12 rounded-2xl text-sm font-semibold text-blue hover:bg-blue/[0.06]">Cancel</button>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
