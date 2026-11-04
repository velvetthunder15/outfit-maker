// Pure mask maths for the cutout pipeline (no DOM, no model). Runs inside the Web Worker,
// and is also exercised by the Node QA script, so keep it dependency-free.

/** Gemini-style box: [ymin, xmin, ymax, xmax] normalised to 0-1000. */
export type Box = [number, number, number, number];
export type PxBox = { x0: number; y0: number; x1: number; y1: number };

export function toPx(b: Box, W: number, H: number): PxBox {
  const [y0, x0, y1, x1] = b.map((v) => Math.max(0, Math.min(1000, v)));
  return {
    x0: Math.floor((Math.min(x0, x1) / 1000) * W),
    y0: Math.floor((Math.min(y0, y1) / 1000) * H),
    x1: Math.min(W - 1, Math.ceil((Math.max(x0, x1) / 1000) * W)),
    y1: Math.min(H - 1, Math.ceil((Math.max(y0, y1) / 1000) * H)),
  };
}

function iou(a: PxBox, b: PxBox) {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  const area = (r: PxBox) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
  return inter / Math.max(1, area(a) + area(b) - inter);
}

/**
 * SAM returns 3 candidate masks per prompt. The model's own IoU guess is unreliable on busy
 * backgrounds (it happily picks the bedsheet *around* a white tee), so we also score how well
 * each candidate's extent matches the box Gemini gave us and how much of it spills outside.
 * `logits` holds n masks of W*H logits back to back.
 */
export function pickMask(logits: Float32Array | number[], scores: ArrayLike<number>, n: number, W: number, H: number, box: PxBox) {
  const N = W * H;
  const m = marginBox(box, W, H, 0.04);
  let best = -1;
  let bestScore = -Infinity;
  for (let k = 0; k < n; k++) {
    const off = k * N;
    let x0 = W, y0 = H, x1 = -1, y1 = -1, inside = 0, total = 0;
    for (let y = 0; y < H; y++) {
      const row = off + y * W;
      for (let x = 0; x < W; x++) {
        if (logits[row + x] > 0) {
          total++;
          if (x >= m.x0 && x <= m.x1 && y >= m.y0 && y <= m.y1) {
            inside++;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
    }
    if (!inside) continue;
    const boxArea = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
    const fill = inside / boxArea; // a real object rarely fills < 6% of its own tight box
    const fit = iou({ x0, y0, x1, y1 }, box);
    const spill = 1 - inside / total;
    const s = fit * 1.0 + Number(scores[k]) * 0.35 - spill * 0.8 - (fill < 0.06 ? 0.5 : 0);
    if (s > bestScore) {
      bestScore = s;
      best = k;
    }
  }
  return { index: best, score: bestScore };
}

function marginBox(b: PxBox, W: number, H: number, frac: number): PxBox {
  const mx = Math.round((b.x1 - b.x0) * frac) + 3;
  const my = Math.round((b.y1 - b.y0) * frac) + 3;
  return { x0: Math.max(0, b.x0 - mx), y0: Math.max(0, b.y0 - my), x1: Math.min(W - 1, b.x1 + mx), y1: Math.min(H - 1, b.y1 + my) };
}

/**
 * Binary mask for one box: chosen candidate, clipped to the (slightly grown) box, small islands
 * dropped, pin-holes filled. Writes 1s into `out` (union across a pair's boxes).
 */
export function refineInto(out: Uint8Array, logits: Float32Array | number[], index: number, W: number, H: number, box: PxBox) {
  const N = W * H;
  const off = index * N;
  const m = marginBox(box, W, H, 0.04);
  const bw = m.x1 - m.x0 + 1;
  const bh = m.y1 - m.y0 + 1;
  const local = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) local[y * bw + x] = logits[off + (y + m.y0) * W + x + m.x0] > 0 ? 1 : 0;

  // Foreground components: keep anything >= 4% of the largest (necklace chains, belt buckles survive).
  const { labels, sizes } = components(local, bw, bh, 1);
  const largest = sizes.reduce((a, b) => Math.max(a, b), 0);
  const keep = sizes.map((s) => s >= Math.max(12, largest * 0.04));
  for (let i = 0; i < local.length; i++) if (local[i] && !keep[labels[i]]) local[i] = 0;

  // Background components that don't touch the box edge and are tiny = noise holes. Fill them.
  const bg = components(local, bw, bh, 0);
  const touches = new Uint8Array(bg.sizes.length);
  for (let x = 0; x < bw; x++) {
    touches[bg.labels[x]] = 1;
    touches[bg.labels[(bh - 1) * bw + x]] = 1;
  }
  for (let y = 0; y < bh; y++) {
    touches[bg.labels[y * bw]] = 1;
    touches[bg.labels[y * bw + bw - 1]] = 1;
  }
  const holeMax = Math.max(16, largest * 0.004);
  for (let i = 0; i < local.length; i++) if (!local[i] && !touches[bg.labels[i]] && bg.sizes[bg.labels[i]] < holeMax) local[i] = 1;

  let count = 0;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++)
      if (local[y * bw + x]) {
        out[(y + m.y0) * W + x + m.x0] = 1;
        count++;
      }
  return count;
}

/** 4-connected component labelling of pixels equal to `value`. Label 0 is reserved for "other". */
function components(mask: Uint8Array, W: number, H: number, value: 0 | 1) {
  const labels = new Int32Array(W * H);
  const sizes: number[] = [0];
  const stack = new Int32Array(W * H);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== value || labels[i]) continue;
    const id = sizes.length;
    let sp = 0, size = 0;
    stack[sp++] = i;
    labels[i] = id;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % W;
      if (x > 0 && mask[p - 1] === value && !labels[p - 1]) { labels[p - 1] = id; stack[sp++] = p - 1; }
      if (x < W - 1 && mask[p + 1] === value && !labels[p + 1]) { labels[p + 1] = id; stack[sp++] = p + 1; }
      if (p >= W && mask[p - W] === value && !labels[p - W]) { labels[p - W] = id; stack[sp++] = p - W; }
      if (p < W * (H - 1) && mask[p + W] === value && !labels[p + W]) { labels[p + W] = id; stack[sp++] = p + W; }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/**
 * Crop the union mask to its extent and turn it into a soft alpha: erode 1 px (drops the
 * background-coloured fringe), then two box blurs (~1.5 px feather). Returns alpha 0-255 for the
 * crop plus the crop rectangle in mask pixels.
 */
export function softAlphaCrop(mask: Uint8Array, W: number, H: number) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (mask[y * W + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = 3;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  let a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = mask[(y + y0) * W + x + x0];
  const area = a.reduce((s, v) => s + v, 0);
  if (area > 4000) a = erode(a, w, h);
  a = boxBlur(boxBlur(a, w, h), w, h);
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < a.length; i++) alpha[i] = Math.round(Math.min(1, a[i] * 1.15) * 255);
  return { alpha, rect: { x: x0, y: y0, w, h } };
}

function erode(a: Float32Array, w: number, h: number) {
  const o = new Float32Array(a.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      o[i] = a[i] && (x === 0 || a[i - 1]) && (x === w - 1 || a[i + 1]) && (y === 0 || a[i - w]) && (y === h - 1 || a[i + w]) ? 1 : 0;
    }
  return o;
}

function boxBlur(a: Float32Array, w: number, h: number) {
  const t = new Float32Array(a.length);
  const o = new Float32Array(a.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      t[i] = (a[i] + (x > 0 ? a[i - 1] : a[i]) + (x < w - 1 ? a[i + 1] : a[i])) / 3;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      o[i] = (t[i] + (y > 0 ? t[i - w] : t[i]) + (y < h - 1 ? t[i + w] : t[i])) / 3;
    }
  return o;
}

/** Where the item lands on the 4:5 white card: centred, `pad` fraction of padding on the tighter side. */
export function fitRect(w: number, h: number, outW: number, outH: number, pad = 0.08, maxUpscale = 4) {
  const s = Math.min((outW * (1 - 2 * pad)) / w, (outH * (1 - 2 * pad)) / h, maxUpscale);
  const dw = w * s, dh = h * s;
  return { x: (outW - dw) / 2, y: (outH - dh) / 2, w: dw, h: dh };
}
