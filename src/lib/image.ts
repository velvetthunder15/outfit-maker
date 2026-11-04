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

export function toBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob(res, type, q));
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
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function render(src: Src, maxSide: number, targetBytes: number, startQ: number) {
  return encode(scaled(src, maxSide), targetBytes, startQ);
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
