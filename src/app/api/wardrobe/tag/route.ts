import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/storage";
import { callGemini, geminiConfigured, parseJson, TAG_SCHEMA, TAGGER_SYSTEM, GeminiError } from "@/lib/gemini";
import { CATEGORIES } from "@/lib/types";

export const maxDuration = 60;

type Tag = {
  is_clothing_or_accessory: boolean;
  name: string;
  category: string;
  subcategory?: string;
  colors: string[];
  pattern: string;
  fabric: string;
  formality: string;
  seasons: string[];
  styles: string[];
};

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!geminiConfigured())
    return NextResponse.json({ error: "AI key not configured. Items were saved; add tags by hand for now." }, { status: 503 });

  const { ids } = (await req.json().catch(() => ({}))) as { ids?: string[] };
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const { data: items } = await supabase
    .from("om_wardrobe_items")
    .select("id, image_path")
    .in("id", ids.slice(0, 12))
    .eq("user_id", user.id);
  if (!items?.length) return NextResponse.json({ results: [] });

  const results = await Promise.all(
    items.map(async (it) => {
      try {
        const left = await supabase.rpc("om_consume_ai_quota", { p_kind: "tag" });
        if (typeof left.data === "number" && left.data < 0) throw new GeminiError("Daily tagging limit reached", 429);
        if (!it.image_path) throw new Error("no image");
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(it.image_path);
        if (error || !blob) throw new Error("download failed");
        const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
        const { text } = await callGemini({
          system: TAGGER_SYSTEM,
          temperature: 0.2,
          schema: TAG_SCHEMA,
          parts: [{ inline_data: { mime_type: blob.type || "image/webp", data: b64 } }, { text: "Tag this item." }],
        });
        const t = parseJson<Tag>(text);
        const category = (CATEGORIES as readonly string[]).includes(t.category) ? t.category : "other";
        const patch = {
          name: t.name?.slice(0, 80) ?? null,
          category,
          subcategory: t.subcategory?.slice(0, 60) ?? null,
          colors: (t.colors ?? []).slice(0, 4).map((c) => c.toLowerCase()),
          pattern: t.pattern?.toLowerCase() ?? null,
          fabric: t.fabric?.toLowerCase() ?? null,
          formality: t.formality ?? null,
          seasons: t.seasons ?? [],
          styles: (t.styles ?? []).slice(0, 5).map((s) => s.toLowerCase()),
          tag_status: "done" as const,
        };
        await supabase.from("om_wardrobe_items").update(patch).eq("id", it.id);
        return { id: it.id, ok: true, ...patch, not_clothing: !t.is_clothing_or_accessory };
      } catch (e) {
        await supabase.from("om_wardrobe_items").update({ tag_status: "failed" }).eq("id", it.id);
        return { id: it.id, ok: false, error: e instanceof Error ? e.message : "failed" };
      }
    })
  );
  return NextResponse.json({ results });
}
