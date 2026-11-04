"use client";
// Main-thread side of the cutout pipeline:
//   photo -> (Gemini: items + tags + boxes) || (worker: EdgeTAM image embedding)
//         -> worker: one mask per item -> here: composite on pure white, 4:5, centred -> WebP blobs.
// Any failure degrades gracefully: no worker/model -> box crops; no detection -> the original photo.
import { decode, decodeChecked, scaled, encode, compressDecoded, toBlob, type Src } from "@/lib/image";
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
      const t = setTimeout(() => {
        this.pending.delete(rid);
        rej(new Error("timeout"));
      }, timeoutMs);
      this.pending.set(rid, { res: () => (clearTimeout(t), res()), rej: (e) => (clearTimeout(t), rej(e)) });
      this.w.postMessage({ ...msg, rid }, transfer);
    });
  }

  async cut(job: string, items: { key: string; boxes: Box[] }[], onPiece?: (done: number) => void) {
    const got = new Map<string, PieceMsg>();
    this.pieceSinks.set(job, (m) => {
      got.set(m.key, m);
      onPiece?.(got.size);
    });
    try {
      await this.call({ type: "cut", job, items }, [], 90_000);
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

function getCutter() {
  if (!cutoutSupported()) return null;
  if (cutter?.broken) cutter = null;
  try {
    cutter ??= new Cutter();
  } catch {
    return null;
  }
  return cutter;
}

/** Start fetching the model early (e.g. when the file picker opens). Safe to call repeatedly. */
export function warmCutter() {
  getCutter()?.call({ type: "warm" }).catch(() => {});
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
  const ic = item.getContext("2d")!;
  ic.imageSmoothingQuality = "high";
  ic.drawImage(hi, r.x, r.y, r.w, r.h, 0, 0, iw, ih);
  if (alpha) {
    const m = document.createElement("canvas");
    m.width = rect.w;
    m.height = rect.h;
    const mc = m.getContext("2d")!;
    const img = mc.createImageData(rect.w, rect.h);
    for (let i = 0, j = 3; i < alpha.length; i++, j += 4) img.data[j] = alpha[i];
    mc.putImageData(img, 0, 0);
    ic.globalCompositeOperation = "destination-in";
    ic.drawImage(m, 0, 0, iw, ih); // bilinear upscale of the feathered mask = smooth edges
  }
  const out = document.createElement("canvas");
  out.width = CARD_W;
  out.height = CARD_H;
  const oc = out.getContext("2d")!;
  oc.fillStyle = "#ffffff";
  oc.fillRect(0, 0, CARD_W, CARD_H);
  oc.drawImage(item, Math.round(f.x), Math.round(f.y));
  return out;
}

async function cardBlobs(card: HTMLCanvasElement) {
  const main = await encode(card, 150 * 1024, 0.82);
  const t = document.createElement("canvas");
  t.width = THUMB_W;
  t.height = THUMB_H;
  const tc = t.getContext("2d")!;
  tc.imageSmoothingQuality = "high";
  tc.drawImage(card, 0, 0, THUMB_W, THUMB_H);
  const thumb = await encode(t, 30 * 1024, 0.78);
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
/**
 * Process one photo into wardrobe pieces. `hint` = an existing item being cleaned up (single item).
 * onStage drives the progress UI; onModel reports first-run model download (0-1).
 */
export async function processPhoto(
  input: File | Blob,
  opts: { hint?: { name?: string | null; category?: string | null }; onStage?: (s: Stage, frac: number) => void; onModel?: (frac: number) => void } = {}
): Promise<Processed> {
  const prog = creeper(opts.onStage ?? (() => {}));
  try {
    return await run(input, opts, prog);
  } finally {
    prog.stop();
  }
}

async function run(
  input: File | Blob,
  opts: { hint?: { name?: string | null; category?: string | null }; onModel?: (frac: number) => void },
  prog: ReturnType<typeof creeper>
): Promise<Processed> {
  prog.to("reading", 0.02, 0.1);
  const src: Src = input instanceof File ? await decodeChecked(input) : await decode(input);
  const hi = scaled(src, 2048);
  const work = scaled(src, 1024);
  if ("close" in src) src.close();
  const W = work.width, H = work.height;
  const source = await compressDecoded(work);
  const photoPiece = (note?: string): Processed => ({
    pieces: [{ key: crypto.randomUUID(), tags: null, main: source.main, thumb: source.thumb, ext: source.ext as "webp" | "jpg", preview: URL.createObjectURL(source.thumb), kind: "photo", selected: true }],
    source: { main: source.main, ext: source.ext as "webp" | "jpg" },
    note,
  });

  // Detection (server, Gemini) and the image embedding (worker) run at the same time.
  prog.to("finding", 0.12, 0.5);
  const job = crypto.randomUUID();
  const c = getCutter();
  if (c) c.onProgress = (f) => opts.onModel?.(f);
  const embedP: Promise<boolean> = c
    ? (() => {
        const data = work.getContext("2d")!.getImageData(0, 0, W, H).data;
        return c.call({ type: "embed", job, data: data.buffer, W, H }, [data.buffer]).then(() => true, () => false);
      })()
    : Promise.resolve(false);

  let items: Detected[] = [];
  try {
    const jpeg = (await toBlob(work, "image/jpeg", 0.82))!;
    const r = await fetch("/api/wardrobe/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: await toBase64(jpeg), mime: "image/jpeg", hint: opts.hint ? { name: opts.hint.name ?? undefined, category: opts.hint.category ?? undefined } : undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      c?.call({ type: "drop", job }).catch(() => {});
      return photoPiece(`${j.error ?? "Couldn't find the pieces"}. Keeping the photo as it is.`);
    }
    items = j.items ?? [];
  } catch {
    c?.call({ type: "drop", job }).catch(() => {});
    return photoPiece("You seem to be offline. Keeping the photo as it is.");
  }
  if (!items.length) {
    c?.call({ type: "drop", job }).catch(() => {});
    return photoPiece("No clothing or accessories found in this photo.");
  }

  prog.to("cutting", 0.5, 0.58);
  const keyed = items.map((t) => ({ key: crypto.randomUUID(), t }));
  let masks = new Map<string, PieceMsg>();
  if (c && (await embedP)) {
    try {
      masks = await c.cut(
        job,
        keyed.map((k) => ({ key: k.key, boxes: k.t.boxes })),
        (n) => prog.to("cutting", 0.5 + (0.32 * n) / keyed.length, 0.5 + (0.32 * Math.min(keyed.length, n + 1)) / keyed.length)
      );
    } catch {
      /* fall through to box crops */
    }
    c.call({ type: "drop", job }).catch(() => {});
  }

  const pieces: Piece[] = [];
  let fellBack = 0;
  for (const [i, k] of keyed.entries()) {
    const m = masks.get(k.key);
    const ok = Boolean(m?.ok && m.alpha && m.rect);
    if (!ok) fellBack++;
    const card = ok ? composeCard(hi, m!.W ?? W, m!.H ?? H, m!.rect!, m!.alpha!) : composeCard(hi, W, H, boxUnion(k.t.boxes, W, H), null);
    const b = await cardBlobs(card);
    const low = ok && (m!.fill ?? 1) < (GARMENT.has(k.t.category) ? 0.33 : 0.15);
    pieces.push({ key: k.key, tags: k.t, ...b, preview: URL.createObjectURL(b.thumb), kind: ok ? "cutout" : "crop", selected: !low, low });
    prog.to("cutting", 0.82 + (0.17 * (i + 1)) / keyed.length, 0.82 + (0.17 * (i + 1)) / keyed.length);
  }
  prog.to("ready", 1, 1);
  return {
    pieces,
    source: { main: source.main, ext: source.ext as "webp" | "jpg" },
    note: fellBack ? (fellBack === pieces.length ? "Cutouts aren't available on this device right now, so pieces are cropped from the photo." : "Some pieces couldn't be cut out cleanly and are cropped instead.") : undefined,
  };
}
