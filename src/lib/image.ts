"use client";

export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;

export async function decode(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

/** Free a canvas's backing store now. Android Chrome caps total canvas memory per tab; canvases
 *  left for the GC pile up across photos until getContext()/toBlob() silently stop working. */
export function release(...canvases: (HTMLCanvasElement | null | undefined)[]) {
  for (const c of canvases) {
    if (!c) continue;
    c.width = 0;
    c.height = 0;
  }
}

function dataUrlToBlob(url: string) {
  const [head, b64] = url.split(",");
  const type = /data:([^;]+)/.exec(head)?.[1] ?? "image/png";
  const bin = atob(b64 ?? "");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type });
}

/**
 * canvas.toBlob with a timeout: on memory-starved phones its callback can simply never fire.
 * Falls back to toDataURL (synchronous) when it times out or returns null.
 */
export function toBlob(canvas: HTMLCanvasElement, type: string, q: number, timeoutMs = 8_000): Promise<Blob | null> {
  return new Promise((res) => {
    let done = false;
    const fallback = () => {
      if (done) return;
      done = true;
      try {
        if (!canvas.width || !canvas.height) return res(null);
        res(dataUrlToBlob(canvas.toDataURL(type, q)));
      } catch {
        res(null);
      }
    };
    const t = setTimeout(fallback, timeoutMs);
    try {
      canvas.toBlob(
        (b) => {
          if (done) return;
          clearTimeout(t);
          if (b) {
            done = true;
            res(b);
          } else fallback();
        },
        type,
        q
      );
    } catch {
      clearTimeout(t);
      fallback();
    }
  });
}

/** getContext("2d") that fails loudly instead of returning null (exhausted canvas memory). */
export function ctx2d(canvas: HTMLCanvasElement) {
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Your phone ran low on memory. Close other tabs and tap Retry.");
  return c;
}

export type Src = ImageBitmap | HTMLImageElement | HTMLCanvasElement;
export const dims = (src: Src) => ({
  w: "naturalWidth" in src ? src.naturalWidth : src.width,
  h: "naturalHeight" in src ? src.naturalHeight : src.height,
});

/** Draw `src` scaled so its longest side is <= maxSide, on white. */
export function scaled(src: Src, maxSide: number) {
  const { w, h } = dims(src);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = ctx2d(canvas);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function render(src: Src, maxSide: number, targetBytes: number, startQ: number) {
  const c = scaled(src, maxSide);
  try {
    return await encode(c, targetBytes, startQ);
  } finally {
    release(c);
  }
}

/** WebP (JPEG fallback) under targetBytes. Re-encoding through canvas strips EXIF (incl. GPS). */
export async function encode(canvas: HTMLCanvasElement, targetBytes: number, startQ: number) {
  let type = "image/webp";
  let q = startQ;
  let blob = await toBlob(canvas, type, q);
  if (!blob || blob.type !== "image/webp") {
    type = "image/jpeg";
    blob = await toBlob(canvas, type, q);
  }
  while (blob && blob.size > targetBytes && q > 0.45) {
    q -= 0.1;
    blob = await toBlob(canvas, type, q);
  }
  if (!blob) throw new Error("Could not encode image");
  return blob;
}

export async function decodeChecked(file: File) {
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error("Photo is over 10 MB");
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) throw new Error("Not an image");
  try {
    return await decode(file);
  } catch {
    throw new Error(/heic|heif/i.test(file.type + file.name) ? "HEIC isn't supported by this browser. Export as JPEG." : "Couldn't read this image");
  }
}

/** ~1024px WebP (<150 KB target) + ~300px thumbnail, from a decoded image or canvas. */
export async function compressDecoded(src: Src) {
  const main = await render(src, 1024, 150 * 1024, 0.8);
  const thumb = await render(src, 300, 30 * 1024, 0.75);
  return { main, thumb, ext: main.type === "image/webp" ? "webp" : "jpg" };
}

/** ~1024px WebP (<150 KB target) + ~300px thumbnail. */
export async function compressForWardrobe(file: File) {
  const src = await decodeChecked(file);
  const main = await render(src, 1024, 150 * 1024, 0.8);
  const thumb = await render(src, 300, 30 * 1024, 0.75);
  if ("close" in src) src.close();
  return { main, thumb, ext: main.type === "image/webp" ? "webp" : "jpg" };
}
