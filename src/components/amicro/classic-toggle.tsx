// Amicro: toggles/classic-toggle (MIT) — controlled + labelled; perf rewrite: CSS transform transition.
export const ClassicToggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    className={`relative w-14 h-8 shrink-0 rounded-full p-1 transition-colors duration-300 cursor-pointer touch-manipulation ${on ? "bg-coral" : "bg-blue/25"}`}
  >
    <div
      className={`w-6 h-6 bg-paper rounded-full shadow-[0_2px_6px_rgba(15,47,73,0.25)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${on ? "translate-x-6" : "translate-x-0"}`}
    />
  </button>
);
