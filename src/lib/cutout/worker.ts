/// <reference lib="webworker" />
// Cutout worker: EdgeTAM (Apache-2.0, Meta; ONNX export by onnx-community) prompted with the
// boxes Gemini found, run by transformers.js (Apache-2.0) on onnxruntime-web WASM.
// Everything heavy is fetched on first use and cached by the browser (Cache Storage):
//   - transformers.js bundle from jsDelivr (pinned)          ~0.6 MB
//   - onnxruntime-web WASM from jsDelivr (pinned by the bundle) ~10 MB
//   - EdgeTAM vision encoder fp32 (19.5 MB) + prompt/mask decoder int8 (8.7 MB) from Hugging Face
// Nothing here is in the page bundle; the worker is only created when a photo is processed.
import { toPx, pickMask, refineInto, softAlphaCrop, type Box } from "./core";

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js";
const MODEL_ID = "onnx-community/EdgeTAM-ONNX";
// int8 encoder is visibly broken on garments (blocky masks); fp32 encoder + int8 decoder matched fp32 quality in QA.
const DTYPE = { vision_encoder: "fp32", prompt_encoder_mask_decoder: "int8" };

/* eslint-disable @typescript-eslint/no-explicit-any */
type T = any;
let lib: Promise<{ T: T; model: T; processor: T }> | null = null;
const embeds = new Map<string, { emb: T; W: number; H: number; orig: number[][]; resized: number[][] }>();

/** Free tensors now: onnxruntime-web keeps their data in the WASM heap until disposed. */
function dispose(...xs: unknown[]) {
  for (const x of xs) {
    if (!x || typeof x !== "object") continue;
    if (typeof (x as { dispose?: unknown }).dispose === "function") {
      try {
        (x as { dispose: () => void }).dispose();
      } catch {
        /* already freed */
      }
    } else if (!Array.isArray(x) && !ArrayBuffer.isView(x)) {
      for (const v of Object.values(x as Record<string, unknown>)) if (v && typeof (v as { dispose?: unknown }).dispose === "function") dispose(v);
    }
  }
}

function drop(job: string) {
  const e = embeds.get(job);
  if (e) dispose(e.emb);
  embeds.delete(job);
}

function post(msg: unknown, transfer: Transferable[] = []) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
}

function load() {
  if (lib) return lib;
  lib = (async () => {
    const T: T = await import(/* webpackIgnore: true */ TRANSFORMERS_URL);
    T.env.allowLocalModels = false;
    T.env.useBrowserCache = true;
    const files = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== "progress" || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let l = 0, t = 0;
      files.forEach((f) => { l += f.loaded; t += f.total; });
      post({ type: "progress", loaded: l, total: t });
    };
    const [model, processor] = await Promise.all([
      T.AutoModel.from_pretrained(MODEL_ID, { dtype: DTYPE, device: "wasm", progress_callback }),
      T.AutoProcessor.from_pretrained(MODEL_ID),
    ]);
    return { T, model, processor };
  })();
  lib.catch(() => (lib = null));
  return lib;
}

async function embed(job: string, data: ArrayBuffer, W: number, H: number) {
  const { T, model, processor } = await load();
  const image = new T.RawImage(new Uint8ClampedArray(data), W, H, 4);
  const t0 = performance.now();
  const inputs = await processor(image);
  let emb: T;
  try {
    emb = await model.get_image_embeddings(inputs);
  } finally {
    dispose(inputs.pixel_values);
  }
  console.debug(`[cutout] embed ${W}x${H} ${Math.round(performance.now() - t0)} ms`);
  // Keep at most the two most recent embeddings (memory on phones): a single-piece re-cut can run
  // between a photo's embed and its cut without evicting it. Clients drop theirs after cutting.
  const keys = Array.from(embeds.keys());
  for (const k of keys.slice(0, Math.max(0, keys.length - 1))) drop(k);
  embeds.set(job, { emb, W, H, orig: inputs.original_sizes, resized: inputs.reshaped_input_sizes });
}

async function cut(job: string, items: { key: string; boxes: Box[] }[]) {
  const { model, processor } = await load();
  const e = embeds.get(job);
  if (!e) throw new Error("no embedding");
  const { emb, W, H, orig, resized } = e;
  const ip = processor.image_processor ?? processor;
  const t0 = performance.now();
  for (const it of items) {
    try {
      const union = new Uint8Array(W * H);
      let any = 0;
      for (const b of it.boxes) {
        const px = toPx(b, W, H);
        if (px.x1 - px.x0 < 4 || px.y1 - px.y0 < 4) continue;
        // One box per decoder call: the ONNX decoder's label input is fixed to one prompt batch.
        // Scale the box into the model's 1024x1024 input space (no need to re-run image preprocessing).
        const input_boxes = ip.reshape_input_points([[[px.x0, px.y0, px.x1, px.y1]]], orig, resized, true);
        const out = await model({ ...emb, input_boxes });
        let masks: T = null;
        try {
          masks = await processor.post_process_masks(out.pred_masks, orig, resized, { binarize: false });
          const cand = masks[0].data as Float32Array;
          const n = masks[0].dims[1] ?? 3;
          const pick = pickMask(cand, out.iou_scores.data, n, W, H, px);
          if (pick.index >= 0) any += refineInto(union, cand, pick.index, W, H, px);
        } finally {
          // never free the cached embedding tensors, even if the model echoes them back
          const keep = new Set(Object.values(emb));
          dispose(...Object.values(out).filter((v) => !keep.has(v)), input_boxes);
          if (masks) dispose(...masks);
        }
      }
      // A cutout that is a speck of its box is a miss: let the client fall back to the photo.
      const boxArea = it.boxes.reduce((s, b) => { const p = toPx(b, W, H); return s + (p.x1 - p.x0) * (p.y1 - p.y0); }, 0);
      const crop = any > Math.max(150, boxArea * 0.08) ? softAlphaCrop(union, W, H) : null;
      if (!crop) post({ type: "piece", job, key: it.key, ok: false });
      // fill = mask area / box area. Real garments fill most of their box; a heavily covered one
      // (a tee under an open overshirt) comes back as ragged strips, so the client unticks it.
      else post({ type: "piece", job, key: it.key, ok: true, alpha: crop.alpha, rect: crop.rect, W, H, fill: any / Math.max(1, boxArea) }, [crop.alpha.buffer]);
    } catch (err) {
      post({ type: "piece", job, key: it.key, ok: false, error: String(err) });
    }
  }
  console.debug(`[cutout] ${items.length} masks ${Math.round(performance.now() - t0)} ms`);
}

// ONNX sessions can't run concurrently: handle messages strictly one after another.
let chain: Promise<void> = Promise.resolve();
self.onmessage = (ev: MessageEvent) => {
  chain = chain.then(() => handle(ev));
};

async function handle(ev: MessageEvent) {
  const m = ev.data as { rid: number; type: string; job?: string; data?: ArrayBuffer; W?: number; H?: number; items?: { key: string; boxes: Box[] }[] };
  try {
    if (m.type === "warm") await load();
    else if (m.type === "embed") await embed(m.job!, m.data!, m.W!, m.H!);
    else if (m.type === "cut") await cut(m.job!, m.items!);
    else if (m.type === "drop") drop(m.job!);
    post({ type: "done", rid: m.rid });
  } catch (err) {
    post({ type: "done", rid: m.rid, error: err instanceof Error ? err.message : String(err) });
  }
}
