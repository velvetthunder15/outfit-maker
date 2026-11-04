"use client";
import { Check, X, Scissors, ArrowRight, RotateCw } from "lucide-react";
import type { Piece, Stage } from "@/lib/cutout/client";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { ShimmerLine } from "@/components/amicro/shimmer-line";

export type Job = {
  key: string;
  mode: "new" | "cleanup";
  name: string;
  preview: string; // original photo (object URL or signed thumb URL)
  stage: Stage | "queued" | "saving";
  frac: number;
  note?: string;
  error?: string;
  pieces: Piece[];
  source?: { main: Blob; ext: "webp" | "jpg" };
  itemId?: string; // cleanup: the wardrobe item being replaced
};

const STAGE_LABEL: Record<Job["stage"], string> = {
  queued: "Waiting",
  reading: "Reading photo",
  finding: "Finding pieces",
  cutting: "Cutting out",
  ready: "Ready",
  error: "Couldn't process",
  saving: "Saving",
};

export function PieceReview({
  jobs,
  model,
  onToggle,
  onDismissJob,
  onRetryJob,
  onSave,
  onDiscard,
  saving,
}: {
  jobs: Job[];
  model: number | null;
  onToggle: (job: string, piece: string) => void;
  onDismissJob: (job: string) => void;
  onRetryJob?: (job: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  const ready = jobs.filter((j) => j.stage === "ready");
  const working = jobs.filter((j) => j.stage !== "ready" && j.stage !== "error").length;
  const selected = ready.reduce((n, j) => n + j.pieces.filter((p) => p.selected).length, 0);
  const cleanup = jobs.every((j) => j.mode === "cleanup");

  return (
    <section aria-label="Review pieces" className="mt-6 rounded-[24px] bg-paper border border-blue/10 p-4 sm:p-6 om-rise">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-blue flex items-center gap-2"><Scissors size={18} /> {cleanup ? "Clean up photos" : "Review pieces"}</h2>
          <p className="text-sm text-muted mt-0.5">{cleanup ? "Each item gets a clean white background. Untick any that look wrong." : "Each piece is cut out onto white. Untick anything that isn't yours or looks wrong."}</p>
        </div>
        <button onClick={onDiscard} disabled={saving} className="h-10 w-10 shrink-0 grid place-items-center rounded-full text-muted hover:bg-blue/10 hover:text-ink disabled:opacity-40" aria-label="Discard all">
          <X size={18} />
        </button>
      </div>

      {model !== null && model < 1 && (
        <div className="mt-4 text-xs text-muted" role="status">
          <div className="flex justify-between"><span>Getting the cutout tool ready (one-time download)</span><span className="tabular">{Math.round(model * 100)}%</span></div>
          <div className="mt-1.5 h-1 rounded-full bg-blue/10 overflow-hidden">
            <div className="h-full w-full origin-left rounded-full bg-blue transition-transform duration-300 ease-out" style={{ transform: `scaleX(${Math.max(0.02, model)})` }} />
          </div>
        </div>
      )}

      <ul className="mt-5 space-y-6">
        {jobs.map((j) => (
          <li key={j.key}>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={j.preview} alt="" decoding="async" className="h-11 w-11 rounded-xl object-cover bg-ivory-deep shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{j.name}</p>
                {j.stage === "ready" || j.stage === "error" ? (
                  <p className={`text-xs ${j.stage === "error" ? "text-coral-deep" : "text-muted"}`}>
                    {j.error ?? j.note ?? (j.mode === "cleanup" ? "Cleaned up" : `${j.pieces.length} piece${j.pieces.length === 1 ? "" : "s"} found`)}
                  </p>
                ) : (
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted" role="status">
                    <span className="shrink-0">{STAGE_LABEL[j.stage]}</span>
                    {j.stage === "queued" ? (
                      <ShimmerLine className="w-12" />
                    ) : (
                      <span className="relative h-1 flex-1 max-w-48 rounded-full bg-blue/10 overflow-hidden">
                        <span className="absolute inset-0 origin-left rounded-full bg-coral transition-transform duration-500 ease-[var(--ease-out-expo)]" style={{ transform: `scaleX(${Math.max(0.04, j.frac)})` }} />
                      </span>
                    )}
                  </div>
                )}
              </div>
              {j.stage === "error" && onRetryJob && (
                <button onClick={() => onRetryJob(j.key)} disabled={saving} className="h-9 shrink-0 inline-flex items-center gap-1.5 rounded-full border border-blue/15 px-3 text-xs font-medium text-blue transition-transform duration-150 active:scale-95 motion-reduce:transition-none hover:bg-blue/10 disabled:opacity-40" aria-label={`Retry ${j.name}`}>
                  <RotateCw size={13} /> Retry
                </button>
              )}
              {(j.stage === "ready" || j.stage === "error") && (
                <button onClick={() => onDismissJob(j.key)} disabled={saving} className="h-9 w-9 grid place-items-center rounded-full text-muted hover:bg-blue/10 disabled:opacity-40" aria-label={`Remove ${j.name}`}>
                  <X size={15} />
                </button>
              )}
            </div>

            {j.stage === "ready" && j.pieces.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
                {j.pieces.map((p, i) => (
                  <li key={p.key} className="om-fade-up" style={{ ["--om-delay" as string]: `${Math.min(i, 8) * 40}ms`, ["--om-d" as string]: "0.35s" }}>
                    <button
                      onClick={() => onToggle(j.key, p.key)}
                      aria-pressed={p.selected}
                      className="group block w-full text-left touch-manipulation transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.96]"
                    >
                      <div className={`relative aspect-[4/5] overflow-hidden rounded-xl bg-white border-2 transition-[border-color,opacity] duration-200 ${p.selected ? "border-blue" : "border-transparent opacity-45"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt={p.tags?.name ?? "Piece"} decoding="async" className="h-full w-full object-cover" />
                        {j.mode === "cleanup" && (
                          <span className="absolute left-1.5 bottom-1.5 flex items-center gap-1 rounded-lg bg-ivory/95 p-0.5 pr-1.5 text-[0.6rem] text-blue">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={j.preview} alt="" className="h-7 w-6 rounded-md object-cover" /> <ArrowRight size={10} />
                          </span>
                        )}
                        <span className={`absolute top-1.5 right-1.5 h-6 w-6 grid place-items-center rounded-full transition-transform duration-200 ${p.selected ? "bg-coral text-blue-ink scale-100" : "bg-ivory/90 text-muted scale-90 border border-blue/20"}`}>
                          {p.selected && <Check size={14} strokeWidth={3} />}
                        </span>
                        {p.low && <span className="absolute left-1.5 top-1.5 rounded-full bg-coral/90 px-1.5 py-0.5 text-[0.58rem] font-semibold text-blue-ink">check</span>}
                        {p.kind !== "cutout" && (
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-ivory/90 px-1.5 py-0.5 text-[0.58rem] font-medium text-muted">{p.kind === "crop" ? "cropped" : "photo"}</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs font-medium truncate">{p.tags?.name ?? "Untagged"}</p>
                      {p.tags?.category && <p className="text-[0.65rem] text-muted truncate">{p.tags.category}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-4 mt-6 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-ivory p-2 pl-4 border border-blue/10 shadow-[0_12px_30px_-18px_rgba(15,47,73,0.45)]">
        <span className="text-sm text-muted flex-1 min-w-32">
          {working ? `${working} photo${working === 1 ? "" : "s"} still working` : selected ? `${selected} selected` : "Nothing selected"}
        </span>
        <MagneticButton onClick={onSave} disabled={saving || !selected} className="disabled:opacity-50">
          {saving ? "Saving…" : !selected ? "Save" : cleanup ? `Replace ${selected} photo${selected === 1 ? "" : "s"}` : `Save ${selected} piece${selected === 1 ? "" : "s"}`}
        </MagneticButton>
      </div>
    </section>
  );
}
