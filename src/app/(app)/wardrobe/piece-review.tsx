"use client";
import { Check, X, Scissors, ArrowRight, RotateCw, Trash2, PencilLine, Plus, ScanSearch } from "lucide-react";
import type { Piece, Stage } from "@/lib/cutout/client";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { ShimmerLine } from "@/components/amicro/shimmer-line";

export type Busy = { label: string; frac: number };
export type ReviewPiece = Piece & { busy?: Busy; added?: boolean };

export type Job = {
  key: string;
  mode: "new" | "cleanup";
  name: string;
  preview: string; // original photo (object URL or signed thumb URL)
  stage: Stage | "queued" | "saving";
  frac: number;
  note?: string;
  error?: string;
  pieces: ReviewPiece[];
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

const KIND_LABEL = { crop: "cropped", photo: "whole photo" } as const;

function Bar({ frac, tone = "coral" }: { frac: number; tone?: "coral" | "blue" }) {
  return (
    <span className="relative block h-1 w-full rounded-full bg-blue/10 overflow-hidden">
      <span
        className={`absolute inset-0 origin-left rounded-full transition-transform duration-500 ease-[var(--ease-out-expo)] motion-reduce:transition-none ${tone === "coral" ? "bg-coral" : "bg-blue"}`}
        style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, frac))})` }}
      />
    </span>
  );
}

export function PieceReview({
  jobs,
  model,
  onToggle,
  onDelete,
  onRetry,
  onModify,
  onAdd,
  onDetectAgain,
  onDismissJob,
  onSave,
  onDiscard,
  saving,
}: {
  jobs: Job[];
  model: number | null;
  onToggle: (job: string, piece: string) => void;
  onDelete: (job: string, piece: string) => void;
  onRetry: (job: string, piece: string) => void;
  onModify: (job: string, piece: string) => void;
  onAdd: (job: string) => void;
  onDetectAgain: (job: string) => void;
  onDismissJob: (job: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  const ready = jobs.filter((j) => j.stage === "ready");
  const working = jobs.filter((j) => j.stage !== "ready" && j.stage !== "error").length;
  const busy = ready.reduce((n, j) => n + j.pieces.filter((p) => p.busy).length, 0);
  const selected = ready.reduce((n, j) => n + j.pieces.filter((p) => p.selected && !p.busy).length, 0);
  const cleanup = jobs.every((j) => j.mode === "cleanup");

  return (
    <section aria-label="Review pieces" className="mt-6 rounded-[24px] bg-paper border border-blue/10 p-4 sm:p-6 om-rise">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-blue flex items-center gap-2"><Scissors size={18} /> {cleanup ? "Clean up photos" : "Review pieces"}</h2>
          <p className="text-sm text-muted mt-0.5">Tap a picture to include or skip it. Delete, retry or edit any piece below it.</p>
        </div>
        <button onClick={onDiscard} disabled={saving} className="h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted hover:bg-blue/10 hover:text-ink disabled:opacity-40" aria-label="Discard all">
          <X size={18} />
        </button>
      </div>

      {model !== null && model < 1 && (
        <div className="mt-4 text-xs text-muted" role="status">
          <div className="flex justify-between"><span>Getting the cutout tool ready (one-time download)</span><span className="tabular">{Math.round(model * 100)}%</span></div>
          <div className="mt-1.5"><Bar frac={model} tone="blue" /></div>
        </div>
      )}

      <ul className="mt-5 space-y-7">
        {jobs.map((j) => {
          const done = j.stage === "ready" || j.stage === "error";
          return (
            <li key={j.key}>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={j.preview} alt="" decoding="async" className="h-11 w-11 rounded-xl object-cover bg-ivory-deep shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{j.name}</p>
                  {done ? (
                    <p className={`text-xs ${j.stage === "error" ? "text-coral-deep" : "text-muted"}`}>
                      {j.error ?? j.note ?? (j.mode === "cleanup" ? "Cleaned up" : `${j.pieces.length} piece${j.pieces.length === 1 ? "" : "s"}`)}
                    </p>
                  ) : (
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted" role="status">
                      <span className="shrink-0">{STAGE_LABEL[j.stage]}</span>
                      {j.stage === "queued" ? <ShimmerLine className="w-12" /> : <span className="flex-1 max-w-48"><Bar frac={j.frac} /></span>}
                    </div>
                  )}
                </div>
                {done && (
                  <button onClick={() => onDismissJob(j.key)} disabled={saving} className="h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted hover:bg-blue/10 disabled:opacity-40" aria-label={`Remove photo ${j.name}`}>
                    <X size={16} />
                  </button>
                )}
              </div>

              {j.stage === "ready" && j.pieces.length > 0 && (
                <ul className="mt-3 grid grid-cols-2 min-[520px]:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {j.pieces.map((p, i) => (
                    <li key={p.key} className="om-fade-up rounded-2xl bg-ivory border border-blue/10 p-1.5" style={{ ["--om-delay" as string]: `${Math.min(i, 8) * 40}ms`, ["--om-d" as string]: "0.35s" }}>
                      <button
                        onClick={() => !p.busy && onToggle(j.key, p.key)}
                        aria-pressed={p.selected}
                        aria-label={`${p.selected ? "Included" : "Skipped"}: ${p.tags?.name ?? "piece"}. Tap to ${p.selected ? "skip" : "include"}.`}
                        disabled={saving}
                        className="group block w-full text-left touch-manipulation transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.97] motion-reduce:transition-none"
                      >
                        <div className={`relative aspect-[4/5] overflow-hidden rounded-xl bg-white border-2 transition-[border-color] duration-200 ${p.selected && !p.busy ? "border-blue" : "border-blue/10"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.preview} alt={p.tags?.name ?? "Piece"} decoding="async" className={`h-full w-full object-cover transition-opacity duration-200 ${p.selected && !p.busy ? "opacity-100" : "opacity-40"}`} />
                          {j.mode === "cleanup" && (
                            <span className="absolute left-1.5 bottom-1.5 flex items-center gap-1 rounded-lg bg-ivory/95 p-0.5 pr-1.5 text-[0.6rem] text-blue">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={j.preview} alt="" className="h-7 w-6 rounded-md object-cover" /> <ArrowRight size={10} />
                            </span>
                          )}
                          <span
                            className={`absolute top-1.5 right-1.5 h-8 w-8 grid place-items-center rounded-full border-2 transition-[transform,background-color,border-color] duration-200 motion-reduce:transition-none ${p.selected ? "bg-coral border-coral text-blue-ink scale-100" : "bg-white/95 border-blue/35 text-transparent scale-90"}`}
                            aria-hidden
                          >
                            <Check size={17} strokeWidth={3} />
                          </span>
                          {!p.selected && !p.busy && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-fit rounded-full bg-blue-ink/85 px-2.5 py-1 text-[0.65rem] font-semibold text-ivory">Skipped</span>}
                          <span className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
                            {p.low && <span className="rounded-full bg-coral/90 px-1.5 py-0.5 text-[0.6rem] font-semibold text-blue-ink">check</span>}
                            {p.kind !== "cutout" && <span className="rounded-full bg-ivory/95 px-1.5 py-0.5 text-[0.6rem] font-medium text-muted">{KIND_LABEL[p.kind]}</span>}
                          </span>
                          {p.busy && (
                            <span className="absolute inset-x-2 bottom-2 rounded-lg bg-ivory/95 px-2 py-1.5 text-[0.65rem] font-medium text-blue" role="status">
                              <span className="block mb-1 truncate">{p.busy.label}</span>
                              <Bar frac={p.busy.frac} />
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 px-0.5 text-xs font-medium truncate">{p.tags?.name || "Untagged"}</p>
                        <p className="px-0.5 text-[0.65rem] text-muted truncate">{p.tags?.category ?? (p.added ? "added by you" : "\u00a0")}</p>
                      </button>
                      <div className="mt-1 grid grid-cols-3 gap-1">
                        <PieceBtn icon={Trash2} label="Delete" danger disabled={saving || Boolean(p.busy)} onClick={() => onDelete(j.key, p.key)} name={p.tags?.name} />
                        <PieceBtn icon={RotateCw} label="Retry" disabled={saving || Boolean(p.busy)} onClick={() => onRetry(j.key, p.key)} name={p.tags?.name} />
                        <PieceBtn icon={PencilLine} label="Edit" disabled={saving || Boolean(p.busy)} onClick={() => onModify(j.key, p.key)} name={p.tags?.name} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {done && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {j.stage === "ready" && j.mode === "new" && j.source && (
                    <button onClick={() => onAdd(j.key)} disabled={saving} className="h-11 inline-flex items-center gap-1.5 rounded-full bg-blue px-4 text-xs font-semibold text-ivory transition-transform duration-150 active:scale-95 motion-reduce:transition-none disabled:opacity-40">
                      <Plus size={15} /> Add a missed piece
                    </button>
                  )}
                  <button onClick={() => onDetectAgain(j.key)} disabled={saving} className="h-11 inline-flex items-center gap-1.5 rounded-full border border-blue/20 px-4 text-xs font-semibold text-blue transition-transform duration-150 active:scale-95 motion-reduce:transition-none hover:bg-blue/[0.06] disabled:opacity-40">
                    <ScanSearch size={15} /> Detect again
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-4 mt-6 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-ivory p-2 pl-4 border border-blue/10 shadow-[0_12px_30px_-18px_rgba(15,47,73,0.45)]">
        <span className="text-sm text-muted flex-1 min-w-32">
          {working ? `${working} photo${working === 1 ? "" : "s"} still working` : busy ? `Redoing ${busy} piece${busy === 1 ? "" : "s"}…` : selected ? `${selected} selected` : "Nothing selected"}
        </span>
        <MagneticButton onClick={onSave} disabled={saving || !selected || busy > 0} className="disabled:opacity-50">
          {saving ? "Saving…" : !selected ? "Save" : cleanup ? `Replace ${selected} photo${selected === 1 ? "" : "s"}` : `Save ${selected} piece${selected === 1 ? "" : "s"}`}
        </MagneticButton>
      </div>
    </section>
  );
}

function PieceBtn({ icon: Icon, label, onClick, disabled, danger, name }: { icon: typeof Trash2; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; name?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} ${name ?? "piece"}`}
      className={`h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl text-[0.65rem] font-semibold touch-manipulation transition-[transform,background-color] duration-150 active:scale-95 motion-reduce:transition-none disabled:opacity-35 ${danger ? "text-coral-deep hover:bg-coral/12" : "text-blue hover:bg-blue/[0.07]"}`}
    >
      <Icon size={17} />
      {label}
    </button>
  );
}
