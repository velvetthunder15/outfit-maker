import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { callGemini, geminiConfigured, parseJson, DETECT_SCHEMA, DETECT_SYSTEM, GeminiError } from "@/lib/gemini";
import { CATEGORIES } from "@/lib/types";

export const maxDuration = 60;

type Raw = {
  name?: string;
  category?: string;
  subcategory?: string;
  colors?: string[];
  pattern?: string;
  fabric?: string;
  formality?: string;
  seasons?: string[];
  styles?: string[];
  boxes?: number[][];
  worn?: boolean;
};

const MAX_B64 = 1_400_000; // ~1 MB image; the client sends a ~1024 px JPEG (~100-200 KB)

/**
 * One Gemini call per photo: finds every wardrobe item, returns tags + boxes.
 * Counts as ONE "tag" against the daily AI quota (300/day), however many items it finds.
 * Body: { image: base64 JPEG/WebP, mime?: string, hint?: { name?: string; category?: string } }
 * `hint` = re-processing an existing single item ("Clean up photos"): return just that item.
 */
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "AI isn't switched on yet" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { image?: string; mime?: string; hint?: { name?: string; category?: string } };
  if (typeof body.image !== "string" || body.image.length < 100) return NextResponse.json({ error: "image required" }, { status: 400 });
  if (body.image.length > MAX_B64) return NextResponse.json({ error: "Image too large" }, { status: 413 });
  const mime = body.mime === "image/webp" || body.mime === "image/png" ? body.mime : "image/jpeg";

  const left = await supabase.rpc("om_consume_ai_quota", { p_kind: "tag" });
  if (typeof left.data === "number" && left.data < 0)
    return NextResponse.json({ error: "Daily AI limit reached (300 photos a day). Photos can still be saved without cutouts." }, { status: 429 });

  const hint = body.hint;
  const ask = hint
    ? `This photo is of ONE wardrobe item the user already saved${hint.name ? `: "${String(hint.name).slice(0, 80)}"` : ""}${hint.category ? ` (category: ${String(hint.category).slice(0, 20)})` : ""}. Return exactly one entry for that item, with its box(es).`
    : "Detect and tag every wardrobe item in this photo.";
  try {
    const { text } = await callGemini({
      system: DETECT_SYSTEM,
      temperature: 0.2,
      schema: DETECT_SCHEMA,
      parts: [{ inline_data: { mime_type: mime, data: body.image } }, { text: ask }],
    });
    const raw = parseJson<{ items?: Raw[] }>(text).items ?? [];
    const items = raw
      .map((t) => {
        const boxes = (t.boxes ?? [])
          .filter((b) => Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(v)))
          .map((b) => b.map((v) => Math.max(0, Math.min(1000, Math.round(v)))) as [number, number, number, number])
          .filter(([y0, x0, y1, x1]) => Math.abs(y1 - y0) >= 8 && Math.abs(x1 - x0) >= 8)
          .slice(0, 4);
        return {
          name: t.name?.slice(0, 80) || "Wardrobe item",
          category: (CATEGORIES as readonly string[]).includes(t.category ?? "") ? t.category! : "other",
          subcategory: t.subcategory?.slice(0, 60) ?? null,
          colors: (t.colors ?? []).slice(0, 4).map((c) => c.toLowerCase()),
          pattern: t.pattern?.toLowerCase() ?? null,
          fabric: t.fabric?.toLowerCase() ?? null,
          formality: t.formality ?? null,
          seasons: t.seasons ?? [],
          styles: (t.styles ?? []).slice(0, 5).map((s) => s.toLowerCase()),
          worn: Boolean(t.worn),
          boxes,
        };
      })
      .filter((i) => i.boxes.length)
      .slice(0, hint ? 1 : 8);
    return NextResponse.json({ items });
  } catch (e) {
    const status = e instanceof GeminiError ? e.status : 500;
    return NextResponse.json({ error: status === 502 ? "The AI is busy right now" : "Detection failed" }, { status });
  }
}
