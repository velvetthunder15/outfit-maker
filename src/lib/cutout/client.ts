"use client";
// Main-thread side of the cutout pipeline:
//   photo -> (Gemini: items + tags + boxes) || (worker: EdgeTAM image embedding)
//         -> worker: one mask per item -> here: composite on pure white, 4:5, centred -> WebP blobs.
// Any failure degrades gracefully: no worker/model -> box crops; no detection -> the original photo.
import { decode, decodeChecked, scaled, encode, compressDecoded, toBlob, release, ctx2d, type Src } from "@/lib/image";
import { fitRect, type Box } from "./core";

export type Detected = {
  name: string;
  category: string;
  subcategory: string | null;
  colors: string[];
  pattern: string | null;
  fabric: string | null;
  formality: string | null;
  seasons: string[];
  styles: string[];
  worn: boolean;
  boxes: Box[];
};

export type Piece = {
  key: string;
  tags: Detected | null;
  main: Blob;
  thumb: Blob;
  ext: "webp" | "jpg";
  preview: string; // object URL of the thumb
  kind: "cutout" | "crop" | "photo";
  selected: boolean;
  low?: boolean; // cutout looks unreliable (mostly hidden item): shown unticked
};

export type Stage = "reading" | "finding" | "cutting" | "ready" | "error";

export type Processed = {
  pieces: Piece[];
  source: { main: Blob; ext: "webp" | "jpg" };
  note?: string;
};

export const CARD_W = 800;
export const CARD_H = 1000;
const THUMB_W = 300;
const THUMB_H = 375;

// ---------------- worker RPC ----------------
type PieceMsg = { type: "piece"; job: string; key: string; ok: boolean; alpha?: Uint8ClampedArray; rect?: { x: number; y: number; w: number; h: number }; W?: number; H?: number; fill?: number };
const GARMENT = new Set(["top", "bottom", "dress", "outerwear"]);

class Cutter {
  private w: Worker;
  private rid = 0;
  private pending = new Map<number, { res: () => void; rej: (e: Error) => void }>();
  private pieceSinks = new Map<string, (m: PieceMsg) => void>();
  onProgress: ((frac: number) => void) | null = null;
  broken = false;
  ready = false; // model loaded at least once (later embeds are a few seconds, not a download)
  photos = 0; // photos embedded by this worker; it is recycled after a few to cap WASM heap growth

  constructor() {
    this.w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") this.onProgress?.(m.total ? m.loaded / m.total : 0);
      else if (m.type === "piece") this.pieceSinks.get(m.job)?.(m as PieceMsg);
      else if (m.type === "done") {
        const p = this.pending.get(m.rid);
        this.pending.delete(m.rid);
        if (m.error) p?.rej(new Error(m.error));
        else p?.res();
      }
    };
    this.w.onerror = () => {
      this.broken = true;
      this.pending.forEach((p) => p.rej(new Error("worker crashed")));
      this.pending.clear();
    };
  }

  call(msg: Record<string, unknown>, transfer: Transferable[] = [], timeoutMs = 180_000) {
    const rid = ++this.rid;
    return new Promise<void>((res, rej) => {
      if (this.broken) return rej(new Error("worker gone"));
      const t = setTimeout(() => {
        this.pending.delete(rid);
        // A worker that stopped answering is stuck (OOM inside WASM, hung fetch): retire it.
        this.terminate();
        rej(new Error("timeout"));
      }, timeoutMs);
      this.pending.set(rid, { res: () => (clearTimeout(t), res()), rej: (e) => (clearTimeout(t), rej(e)) });
      this.w.postMessage({ ...msg, rid }, transfer);
    });
  }

  terminate() {
    if (this.broken) return;
    this.broken = true;
    try {
      this.w.terminate();
    } catch {
      /* already gone */
    }
    this.pending.forEach((p) => p.rej(new Error("worker terminated")));
    this.pending.clear();
    this.pieceSinks.clear();
    if (cutter === this) cutter = null;
  }

  async cut(job: string, items: { key: string; boxes: Box[] }[], onPiece?: (done: number) => void) {
    const got = new Map<string, PieceMsg>();
    this.pieceSinks.set(job, (m) => {
      got.set(m.key, m);
      onPiece?.(got.size);
    });
    try {
      await this.call({ type: "cut", job, items }, [], 30_000 + 8_000 * items.length);
    } finally {
      this.pieceSinks.delete(job);
    }
    return got;
  }
}

let cutter: Cutter | null = null;

/** Cutouts need a module worker + WASM, and a little memory headroom. */
export function cutoutSupported() {
  if (typeof window === "undefined" || typeof Worker === "undefined" || typeof WebAssembly === "undefined") return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return !(mem && mem < 2);
}

const RECYCLE_AFTER = 8;

function getCutter() {
  if (!cutoutSupported()) return null;
  if (cutter?.broken) cutter = null;
  if (cutter && cutter.photos >= RECYCLE_AFTER && cutter.ready) {
    // Fresh worker = fresh WASM heap (it only grows). The model comes from the browser cache.
    cutter.terminate();
    cutter = null;
  }
  try {
    cutter ??= new Cutter();
  } catch {
    return null;
  }
  return cutter;
}

/** Start fetching the model early (e.g. when the file picker opens). Safe to call repeatedly. */
export function warmCutter() {
  const c = getCutter();
  c?.call({ type: "warm" }).then(() => (c.ready = true), () => {});
}

/** Throw away the worker (e.g. after a job was abandoned by the watchdog). */
export function resetCutter() {
  cutter?.terminate();
  cutter = null;
}

// ---------------- helpers ----------------
async function toBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * The card: item centred on pure #FFFFFF at 4:5 with ~8% padding. `rect` is in work-image pixels;
 * pixels come from the higher-resolution `hi` canvas so small items (watches, earrings) stay sharp.
 */
export function composeCard(hi: HTMLCanvasElement, W: number, H: number, rect: { x: number; y: number; w: number; h: number }, alpha: Uint8ClampedArray | null) {
  const sx = hi.width / W;
  const sy = hi.height / H;
  const r = { x: rect.x * sx, y: rect.y * sy, w: rect.w * sx, h: rect.h * sy };
  const f = fitRect(r.w, r.h, CARD_W, CARD_H, alpha ? 0.08 : 0.04);
  const iw = Math.max(1, Math.round(f.w));
  const ih = Math.max(1, Math.round(f.h));
  const item = document.createElement("canvas");
  item.width = iw;
  item.height = ih;
  const ic = ctx2d(item);
  ic.imageSmoothingQuality = "high";
  ic.drawImage(hi, r.x, r.y, r.w, r.h, 0, 0, iw, ih);
  if (alpha) {
    const m = document.createElement("canvas");
    m.width = rect.w;
    m.height = rect.h;
    const mc = ctx2d(m);
    const img = mc.createImageData(rect.w, rect.h);
    for (let i = 0, j = 3; i < alpha.length; i++, j += 4) img.data[j] = alpha[i];
    mc.putImageData(img, 0, 0);
    ic.globalCompositeOperation = "destination-in";
    ic.drawImage(m, 0, 0, iw, ih); // bilinear upscale of the feathered mask = smooth edges
    release(m);
  }
  const out = document.createElement("canvas");
  out.width = CARD_W;
  out.height = CARD_H;
  const oc = ctx2d(out);
  oc.fillStyle = "#ffffff";
  oc.fillRect(0, 0, CARD_W, CARD_H);
  oc.drawImage(item, Math.round(f.x), Math.round(f.y));
  release(item);
  return out;
}

async function cardBlobs(card: HTMLCanvasElement) {
  const main = await encode(card, 150 * 1024, 0.82);
  const t = document.createElement("canvas");
  t.width = THUMB_W;
  t.height = THUMB_H;
  const tc = ctx2d(t);
  tc.imageSmoothingQuality = "high";
  tc.drawImage(card, 0, 0, THUMB_W, THUMB_H);
  const thumb = await encode(t, 30 * 1024, 0.78).finally(() => release(t));
  return { main, thumb, ext: (main.type === "image/webp" ? "webp" : "jpg") as "webp" | "jpg" };
}

function boxUnion(boxes: Box[], W: number, H: number) {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const [a, b, c, d] of boxes) {
    y0 = Math.min(y0, (a / 1000) * H);
    x0 = Math.min(x0, (b / 1000) * W);
    y1 = Math.max(y1, (c / 1000) * H);
    x1 = Math.max(x1, (d / 1000) * W);
  }
  const mx = (x1 - x0) * 0.04, my = (y1 - y0) * 0.04;
  x0 = Math.max(0, Math.floor(x0 - mx)); y0 = Math.max(0, Math.floor(y0 - my));
  x1 = Math.min(W, Math.ceil(x1 + mx)); y1 = Math.min(H, Math.ceil(y1 + my));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Progress that keeps easing toward the end of the current stage, so the bar never sits still. */
function creeper(report: (s: Stage, f: number) => void) {
  let cur = 0, target = 0, st: Stage = "reading";
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = () => {
    cur += (target - cur) * 0.05;
    report(st, cur);
  };
  return {
    to(s: Stage, from: number, to: number) {
      st = s;
      cur = Math.max(cur, from);
      target = Math.max(target, to);
      report(st, cur);
      timer ??= setInterval(tick, 350);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

// ---------------- the pipeline ----------------
type Opts = {
  hint?: { name?: string | null; category?: string | null };
  onStage?: (s: Stage, frac: number) => void;
  onModel?: (frac: number) => void;
  /** Override for tests (and the detect endpoint is the only network call in a job). */
  detect?: (body: { image: string; mime: string; hint?: { name?: string; category?: string } }, signal: AbortSignal) => Promise<Response>;
};

/** A job that makes no real progress for this long is abandoned so the queue moves on. */
export const STALL_MS = 75_000;
const DETECT_TIMEOUT_MS = 45_000; // server caps its own Gemini chain at ~40 s

export class StalledError extends Error {
  constructor() {
    super("This photo got stuck. Tap Retry.");
    this.name = "StalledError";
  }
}

/**
 * Process one photo into wardrobe pieces. `hint` = an existing item being cleaned up (single item).
 * onStage drives the progress UI; onModel reports first-run model download (0-1).
 * Never hangs: a watchdog rejects with StalledError after STALL_MS without a real milestone.
 */
export async function processPhoto(input: File | Blob, opts: Opts = {}): Promise<Processed> {
  const prog = creeper(opts.onStage ?? (() => {}));
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fail: (e: Error) => void = () => {};
  const stalled = new Promise<never>((_, rej) => (fail = rej));
  const alive = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      abort.abort();
      // Whatever hung may be inside the worker: start the next photo with a fresh one.
      resetCutter();
      fail(new StalledError());
    }, STALL_MS);
  };
  alive();
  const work = run(input, opts, prog, alive, abort.signal);
  work.catch(() => {}); // if the watchdog won, the late result/error is dropped
  try {
    return await Promise.race([work, stalled]);
  } finally {
    if (timer) clearTimeout(timer);
    prog.stop();
  }
}

async function detectOnce(body: Parameters<NonNullable<Opts["detect"]>>[0], outer: AbortSignal, impl?: Opts["detect"]) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), DETECT_TIMEOUT_MS);
  const onOuter = () => ac.abort();
  outer.addEventListener("abort", onOuter);
  try {
    if (impl) return await impl(body, ac.signal);
    return await fetch("/api/wardrobe/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
  } finally {
    clearTimeout(t);
    outer.removeEventListener("abort", onOuter);
  }
}

async function run(input: File | Blob, opts: Opts, prog: ReturnType<typeof creeper>, alive: () => void, signal: AbortSignal): Promise<Processed> {
  prog.to("reading", 0.02, 0.1);
  const src: Src = input instanceof File ? await decodeChecked(input) : await decode(input);
  let hi: HTMLCanvasElement | null = null;
  let work: HTMLCanvasElement | null = null;
  const job = crypto.randomUUID();
  let c: Cutter | null = null;
  try {
    try {
      hi = scaled(src, 2048);
      work = scaled(src, 1024);
    } finally {
      if ("close" in src) src.close();
    }
    const W = work.width, H = work.height;
    const source = await compressDecoded(work);
    alive();
    const photoPiece = (note?: string): Processed => ({
      pieces: [{ key: crypto.randomUUID(), tags: null, main: source.main, thumb: source.thumb, ext: source.ext as "webp" | "jpg", preview: URL.createObjectURL(source.thumb), kind: "photo", selected: true }],
      source: { main: source.main, ext: source.ext as "webp" | "jpg" },
      note,
    });

    // Detection (server, Gemini) and the image embedding (worker) run at the same time.
    prog.to("finding", 0.12, 0.5);
    c = getCutter();
    if (c) {
      c.onProgress = (f) => {
        alive(); // model download is real progress
        opts.onModel?.(f);
      };
    }
    const cc = c;
    const embedP: Promise<boolean> = cc
      ? (() => {
          const data = ctx2d(work).getImageData(0, 0, W, H).data;
          cc.photos++;
          return cc.call({ type: "embed", job, data: data.buffer, W, H }, [data.buffer], cc.ready ? 60_000 : 180_000).then(
            () => ((cc.ready = true), true),
            () => false
          );
        })()
      : Promise.resolve(false);

    // Detection gets a SQUARE white-padded copy: every model (Gemini, Groq Qwen, OpenRouter) then agrees on
    // what "0-1000" means for x and y. Boxes are mapped back to the unpadded photo below.
    const S = Math.max(W, H), padX = (S - W) / 2, padY = (S - H) / 2;
    const sq = document.createElement("canvas");
    sq.width = S;
    sq.height = S;
    {
      const sctx = ctx2d(sq);
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, S, S);
      sctx.drawImage(work, padX, padY);
    }
    const jpeg = await toBlob(sq, "image/jpeg", 0.82);
    release(sq);
    const unpad = (b: Box): Box => {
      const clamp = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));
      const [y0, x0, y1, x1] = b;
      return [clamp(((y0 / 1000) * S - padY) / H * 1000), clamp(((x0 / 1000) * S - padX) / W * 1000), clamp(((y1 / 1000) * S - padY) / H * 1000), clamp(((x1 / 1000) * S - padX) / W * 1000)] as Box;
    };
    // The work canvas is no longer needed (embedding got its own copy of the pixels).
    release(work);
    work = null;
    let items: Detected[] = [];
    let failNote: string | null = null;
    if (!jpeg) failNote = "Couldn't read this photo on this device. Keeping the photo as it is.";
    else {
      const body = { image: await toBase64(jpeg), mime: "image/jpeg", hint: opts.hint ? { name: opts.hint.name ?? undefined, category: opts.hint.category ?? undefined } : undefined };
      for (let attempt = 0; attempt < 2; attempt++) {
        const t0 = Date.now();
        try {
          const r = await detectOnce(body, signal, opts.detect);
          const j = await r.json().catch(() => ({}));
          if (r.ok) {
            items = ((j.items ?? []) as Detected[])
              .map((it) => ({
                ...it,
                boxes: (it.boxes ?? []).map(unpad).filter(([y0, x0, y1, x1]) => y1 - y0 >= 8 && x1 - x0 >= 8),
              }))
              .filter((it) => it.boxes.length);
            failNote = null;
            break;
          }
          failNote = `${j.error ?? "Couldn't find the pieces"}. Keeping the photo as it is.`;
          // Retry only gateway hiccups that failed fast; 4xx (quota, sign-in) won't change.
          if (!(r.status >= 500 && Date.now() - t0 < 20_000)) break;
        } catch {
          if (signal.aborted) throw new StalledError();
          const timedOut = Date.now() - t0 >= DETECT_TIMEOUT_MS - 500;
          failNote = timedOut ? "Finding the pieces took too long. Keeping the photo as it is." : "You seem to be offline. Keeping the photo as it is.";
          if (timedOut) break; // a second 45 s wait would stall the queue
        }
        alive();
      }
    }
    alive();
    if (failNote || !items.length) {
      cc?.call({ type: "drop", job }).catch(() => {});
      return photoPiece(failNote ?? "No clothing or accessories found in this photo.");
    }

    prog.to("cutting", 0.5, 0.58);
    const keyed = items.map((t) => ({ key: crypto.randomUUID(), t }));
    let masks = new Map<string, PieceMsg>();
    if (cc && (await embedP)) {
      alive();
      try {
        masks = await cc.cut(
          job,
          keyed.map((k) => ({ key: k.key, boxes: k.t.boxes })),
          (n) => {
            alive();
            prog.to("cutting", 0.5 + (0.32 * n) / keyed.length, 0.5 + (0.32 * Math.min(keyed.length, n + 1)) / keyed.length);
          }
        );
      } catch {
        /* fall through to box crops */
      }
      cc.call({ type: "drop", job }).catch(() => {});
    }
    alive();
    if (signal.aborted) throw new StalledError();

    const pieces: Piece[] = [];
    let fellBack = 0;
    for (const [i, k] of keyed.entries()) {
      const m = masks.get(k.key);
      const ok = Boolean(m?.ok && m.alpha && m.rect);
      if (!ok) fellBack++;
      const card = ok ? composeCard(hi, m!.W ?? W, m!.H ?? H, m!.rect!, m!.alpha!) : composeCard(hi, W, H, boxUnion(k.t.boxes, W, H), null);
      const b = await cardBlobs(card).finally(() => release(card));
      const low = ok && (m!.fill ?? 1) < (GARMENT.has(k.t.category) ? 0.33 : 0.15);
      pieces.push({ key: k.key, tags: k.t, ...b, preview: URL.createObjectURL(b.thumb), kind: ok ? "cutout" : "crop", selected: !low, low });
      alive();
      prog.to("cutting", 0.82 + (0.17 * (i + 1)) / keyed.length, 0.82 + (0.17 * (i + 1)) / keyed.length);
    }
    prog.to("ready", 1, 1);
    return {
      pieces,
      source: { main: source.main, ext: source.ext as "webp" | "jpg" },
      note: fellBack ? (fellBack === pieces.length ? "Cutouts aren't available on this device right now, so pieces are cropped from the photo." : "Some pieces couldn't be cut out cleanly and are cropped instead.") : undefined,
    };
  } finally {
    release(hi, work);
    if (c) c.onProgress = null;
  }
}
