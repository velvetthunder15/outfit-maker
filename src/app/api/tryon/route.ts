import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/storage";
import { callGemini, geminiConfigured, IMAGE_MODEL, GeminiError } from "@/lib/gemini";
import type { OutfitResult } from "@/lib/types";

export const maxDuration = 120;

/** Optional virtual try-on (idea ported from paipiange/nvzhuang): selfie + outfit -> Gemini image model. Nothing is stored. */
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "AI key not configured" }, { status: 503 });
  const { outfit_id, selfie, mime } = (await req.json().catch(() => ({}))) as { outfit_id?: string; selfie?: string; mime?: string };
  if (!outfit_id || !selfie || selfie.length > 2_800_000) return NextResponse.json({ error: "Photo missing or too large" }, { status: 400 });

  const left = await supabase.rpc("om_consume_ai_quota", { p_kind: "tryon" });
  if ((left.data as number) < 0) return NextResponse.json({ error: "Try-on is limited to 5 a day" }, { status: 429 });

  const { data: outfit } = await supabase.from("om_outfits").select("result, item_ids").eq("id", outfit_id).single();
  if (!outfit) return NextResponse.json({ error: "Outfit not found" }, { status: 404 });
  const r = outfit.result as OutfitResult;

  const parts: ({ text: string } | { inline_data: { mime_type: string; data: string } })[] = [
    { inline_data: { mime_type: mime || "image/jpeg", data: selfie } },
  ];
  const { data: items } = await supabase.from("om_wardrobe_items").select("id, thumb_path, image_path").in("id", (outfit.item_ids ?? []).slice(0, 5));
  for (const it of items ?? []) {
    const path = it.image_path ?? it.thumb_path;
    if (!path) continue;
    const { data: blob } = await supabase.storage.from(BUCKET).download(path);
    if (blob) parts.push({ inline_data: { mime_type: blob.type || "image/webp", data: Buffer.from(await blob.arrayBuffer()).toString("base64") } });
  }
  parts.push({
    text: `Create a realistic, tasteful full-length fashion photo of the person in the first image wearing this outfit: ${r.pieces
      .map((p) => `${p.slot}: ${p.description}`)
      .join("; ")}. ${items?.length ? "The following images are the exact garments and accessories to use." : ""} Keep the person's face, skin tone and body proportions. Clean editorial background, natural light. Fully clothed, safe for work.`,
  });
  try {
    const { images } = await callGemini({ model: IMAGE_MODEL, parts, imageOut: true, temperature: 0.6 });
    if (!images.length) return NextResponse.json({ error: "The model returned no image. Try a clearer, well-lit photo." }, { status: 502 });
    return NextResponse.json({ image: `data:${images[0].mime};base64,${images[0].data}` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Try-on failed" }, { status: e instanceof GeminiError ? e.status : 500 });
  }
}
