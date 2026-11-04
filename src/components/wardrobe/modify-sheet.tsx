"use client";
// One "Modify" sheet for both a piece under review and a saved wardrobe item:
// Details (tags) + Crop (move/resize the box over the original photo, then re-cut on white).
import { useEffect, useState, type ReactNode } from "react";
import { m } from "motion/react";
import { X, Scissors, Crop, Maximize2, Undo2 } from "lucide-react";
import { CATEGORIES, FORMALITY, SEASONS } from "@/lib/types";
import type { Box } from "@/lib/cutout/core";
import { PromptChips } from "@/components/amicro/prompt-chips";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { CropEditor } from "./crop-editor";
import { Portal } from "@/components/portal";

export type TagDraft = {
  name: string;
  category: string | null;
  subcategory: string | null;
  colors: string[];
  pattern: string | null;
  fabric: string | null;
  formality: string | null;
  seasons: string[];
  styles: string[];
  notes?: string | null;
};

export type ModifyResult = { tags: TagDraft; box: Box | null; boxChanged: boolean; cut: "cutout" | "crop" };

const FULL: Box = [0, 0, 1000, 1000];
const list = (s: string) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 6);
const same = (a: Box | null, b: Box | null) => (a ?? []).join() === (b ?? []).join();

export function ModifySheet({
  title,
  tags,
  preview,
  previewWhite,
  photo,
  box,
  cut,
  startOn = "details",
  showNotes,
  applyLabel = "Done",
  footer,
  onApply,
  onClose,
}: {
  title: string;
  tags: TagDraft;
  preview?: string | null;
  previewWhite?: boolean;
  /** The original photo: a URL, or a loader (signed on demand), or null when there is none. */
  photo: string | null | (() => Promise<string | null>);
  box: Box | null;
  cut: "cutout" | "crop";
  startOn?: "details" | "crop";
  showNotes?: boolean;
  applyLabel?: string;
  footer?: ReactNode;
  onApply: (r: ModifyResult) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"details" | "crop">(startOn);
  const [d, setD] = useState<TagDraft>(tags);
  const [b, setB] = useState<Box | null>(box);
  const [mode, setMode] = useState<"cutout" | "crop">(cut);
  const [src, setSrc] = useState<string | null>(typeof photo === "string" ? photo : null);
  const [loading, setLoading] = useState(false);
  const adding = startOn === "crop" && !box;

  useEffect(() => {
    if (typeof photo !== "function" || src || tab !== "crop") return;
    let live = true;
    setLoading(true);
    photo().then((u) => live && setSrc(u)).finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [photo, src, tab]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const set = <K extends keyof TagDraft>(k: K, v: TagDraft[K]) => setD((s) => ({ ...s, [k]: v }));
  const boxChanged = !same(b, box) || (b !== null && mode !== cut);
  const canApply = !adding || Boolean(b);

  return (
    <Portal>
    <>
      <m.div className="fixed inset-0 z-40 bg-blue-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
      <m.aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed z-50 inset-x-0 bottom-0 max-h-[94dvh] md:inset-y-0 md:left-auto md:right-0 md:w-[460px] md:max-h-none flex flex-col bg-ivory rounded-t-[28px] md:rounded-none md:rounded-l-[28px] shadow-[0_-20px_60px_-20px_rgba(15,47,73,0.5)]"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        <div className="px-5 pt-3 pb-3 border-b border-blue/10">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-blue/20 md:hidden" />
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview && <img src={preview} alt="" className={`h-12 w-10 shrink-0 rounded-lg object-cover border border-blue/10 ${previewWhite ? "bg-white" : "bg-paper"}`} />}
            <h2 className="flex-1 min-w-0 truncate text-lg font-semibold text-blue">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="h-11 w-11 shrink-0 grid place-items-center rounded-full hover:bg-blue/10"><X size={20} /></button>
          </div>
          {!adding && (
            <div role="tablist" className="mt-3 grid grid-cols-2 rounded-full bg-blue/[0.07] p-1">
              {(["details", "crop"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`h-10 rounded-full text-sm font-semibold transition-[background-color,color] duration-200 ${tab === t ? "bg-blue text-ivory shadow-[0_6px_16px_-10px_rgba(23,71,109,0.9)]" : "text-blue"}`}
                >
                  {t === "details" ? "Details" : "Crop"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {tab === "crop" ? (
            <div className="om-fade-up" style={{ ["--om-d" as string]: "0.25s" }}>
              {src ? (
                <CropEditor src={src} box={b} onChange={setB} />
              ) : (
                <div className="grid aspect-[4/5] w-full max-w-xs mx-auto place-items-center rounded-2xl bg-paper text-sm text-muted text-center px-6">
                  {loading ? "Loading the original photo…" : "There's no original photo for this item, so the crop can't be changed."}
                </div>
              )}
              <p className="mt-3 text-xs text-muted text-center">Drag the box or its corners, pinch to resize, or drag outside it to draw a new one.</p>
              {src && (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to cut it">
                    {([["cutout", "Cut out", Scissors], ["crop", "Plain crop", Crop]] as const).map(([id, label, Icon]) => (
                      <button
                        key={id}
                        role="radio"
                        aria-checked={mode === id}
                        onClick={() => setMode(id)}
                        className={`h-12 inline-flex items-center justify-center gap-2 rounded-2xl border-2 text-sm font-semibold transition-[border-color,background-color] duration-200 ${mode === id ? "border-blue bg-blue/[0.07] text-blue" : "border-blue/15 text-muted"}`}
                      >
                        <Icon size={16} /> {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => setB(FULL)} className="h-11 flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-blue/15 text-xs font-semibold text-blue active:scale-95 transition-transform motion-reduce:transition-none"><Maximize2 size={14} /> Whole photo</button>
                    {box && !same(b, box) && (
                      <button onClick={() => setB(box)} className="h-11 flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-blue/15 text-xs font-semibold text-blue active:scale-95 transition-transform motion-reduce:transition-none"><Undo2 size={14} /> Reset box</button>
                    )}
                  </div>
                </>
              )}
              {adding && (
                <label className="mt-5 block text-sm text-muted">What is it? (optional)<input className="field mt-1" value={d.name} placeholder="e.g. silver hoops" onChange={(e) => set("name", e.target.value)} /></label>
              )}
            </div>
          ) : (
            <div className="space-y-4 om-fade-up" style={{ ["--om-d" as string]: "0.25s" }}>
              <label className="block text-sm text-muted">Name<input className="field mt-1" value={d.name} onChange={(e) => set("name", e.target.value)} /></label>
              <div>
                <p className="text-sm text-muted mb-2">Category</p>
                <PromptChips size="sm" chips={CATEGORIES.map((c) => ({ id: c, label: c }))} value={d.category ? [d.category] : []} onChange={(v) => set("category", v[0] ?? null)} />
              </div>
              <label className="block text-sm text-muted">Type (e.g. kurta, jhumka, chelsea boot)<input className="field mt-1" value={d.subcategory ?? ""} onChange={(e) => set("subcategory", e.target.value || null)} /></label>
              <label className="block text-sm text-muted">Colours (comma separated)<input className="field mt-1" defaultValue={d.colors.join(", ")} onBlur={(e) => set("colors", list(e.target.value))} onChange={(e) => set("colors", list(e.target.value))} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-muted">Pattern<input className="field mt-1" value={d.pattern ?? ""} onChange={(e) => set("pattern", e.target.value || null)} /></label>
                <label className="block text-sm text-muted">Fabric<input className="field mt-1" value={d.fabric ?? ""} onChange={(e) => set("fabric", e.target.value || null)} /></label>
              </div>
              <div>
                <p className="text-sm text-muted mb-2">Formality</p>
                <PromptChips size="sm" chips={FORMALITY.map((c) => ({ id: c, label: c }))} value={d.formality ? [d.formality] : []} onChange={(v) => set("formality", v[0] ?? null)} />
              </div>
              <div>
                <p className="text-sm text-muted mb-2">Seasons</p>
                <PromptChips size="sm" multiple chips={SEASONS.map((c) => ({ id: c, label: c }))} value={d.seasons} onChange={(v) => set("seasons", v)} />
              </div>
              <label className="block text-sm text-muted">Styles (comma separated)<input className="field mt-1" defaultValue={d.styles.join(", ")} onChange={(e) => set("styles", list(e.target.value))} /></label>
              {showNotes && (
                <label className="block text-sm text-muted">Notes<input className="field mt-1" value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. a bit tight, only for weddings" /></label>
              )}
              {footer}
            </div>
          )}
        </div>

        <div className="border-t border-blue/10 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] flex items-center gap-3">
          <p className="flex-1 min-w-0 text-xs text-muted">
            {boxChanged && b ? (mode === "cutout" ? "Will cut it out again with the new box." : "Will crop it again with the new box.") : adding ? "Draw a box, then add it." : ""}
          </p>
          <MagneticButton disabled={!canApply} onClick={() => onApply({ tags: d, box: b, boxChanged: boxChanged && Boolean(b), cut: mode })}>
            {adding ? "Add piece" : boxChanged && b ? "Apply & re-cut" : applyLabel}
          </MagneticButton>
        </div>
      </m.aside>
    </>
    </Portal>
  );
}
