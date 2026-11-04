"use client";
// One toast at a time with an Undo button. The action's real commit (deleting files, freeing blobs)
// runs when the toast expires, when another toast replaces it, or when the page goes away.
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";

type Pending = { id: number; msg: string; undo?: () => void; commit?: () => void; timer: ReturnType<typeof setTimeout> | null };

export function useUndoToast() {
  const [toast, setToast] = useState<{ id: number; msg: string; canUndo: boolean } | null>(null);
  const cur = useRef<Pending | null>(null);
  const seq = useRef(0);

  const flush = useCallback(() => {
    const p = cur.current;
    cur.current = null;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    try {
      p.commit?.();
    } catch {
      /* best effort */
    }
  }, []);

  const show = useCallback(
    (msg: string, o: { undo?: () => void; commit?: () => void; ms?: number } = {}) => {
      flush();
      const id = ++seq.current;
      const p: Pending = { id, msg, undo: o.undo, commit: o.commit, timer: null };
      p.timer = setTimeout(() => {
        if (cur.current?.id !== id) return;
        flush();
        setToast((t) => (t?.id === id ? null : t));
      }, o.ms ?? (o.undo ? 6000 : 3500));
      cur.current = p;
      setToast({ id, msg, canUndo: Boolean(o.undo) });
    },
    [flush]
  );

  const undo = useCallback(() => {
    const p = cur.current;
    cur.current = null;
    if (p?.timer) clearTimeout(p.timer);
    setToast(null);
    p?.undo?.();
  }, []);

  const dismiss = useCallback(() => {
    flush();
    setToast(null);
  }, [flush]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return { toast, show, undo, dismiss };
}

export function UndoToast({ toast, onUndo, onDismiss }: { toast: { id: number; msg: string; canUndo: boolean } | null; onUndo: () => void; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] md:bottom-6">
      <div
        key={toast.id}
        role="status"
        aria-live="polite"
        className="pointer-events-auto om-rise flex w-full max-w-md items-center gap-2 rounded-2xl bg-blue-ink py-1.5 pl-4 pr-1.5 text-sm text-ivory shadow-[0_18px_40px_-16px_rgba(15,47,73,0.7)]"
        style={{ ["--om-d" as string]: "0.28s" }}
      >
        <span className="flex-1 min-w-0 truncate">{toast.msg}</span>
        {toast.canUndo && (
          <button onClick={onUndo} className="h-11 shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 font-semibold text-coral transition-transform duration-150 active:scale-95 motion-reduce:transition-none hover:bg-white/10">
            <RotateCcw size={15} /> Undo
          </button>
        )}
        <button onClick={onDismiss} aria-label="Dismiss" className="h-11 w-11 shrink-0 grid place-items-center rounded-xl text-ivory/70 hover:bg-white/10">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
