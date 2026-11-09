import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/storage";
import { getWeather } from "@/lib/weather";
import {
  callGemini, geminiConfigured, parseJson, OUTFIT_SCHEMA, STYLIST_SYSTEM, wardrobeRules, generalRules, GeminiError, validateOutfitResponse,
} from "@/lib/gemini";
import { pinterestUrl } from "@/lib/pinterest";
import type { OutfitResult, WardrobeItem } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({
  mood: z.string().max(60),
  occasion: z.string().max(120),
  notes: z.string().max(300).optional().default(""),
  destination: z.object({ name: z.string().max(120), lat: z.number(), lon: z.number(), country: z.string().optional() }),
  local_time: z.string().max(20).nullable().optional(), // "YYYY-MM-DDTHH:mm" at destination
  time_of_day: z.string().max(20).optional().default(""),
  force_general: z.boolean().optional().default(false),
});

function itemLine(i: WardrobeItem) {
  return [
    `id=${i.id}`,
    `category=${i.category ?? "?"}`,
    i.subcategory && `type=${i.subcategory}`,
    i.name && `name="${i.name}"`,
    i.colors?.length && `colors=${i.colors.join("/")}`,
    i.pattern && `pattern=${i.pattern}`,
    i.fabric && `fabric=${i.fabric}`,
    i.formality && `formality=${i.formality}`,
    i.seasons?.length && `seasons=${i.seasons.join("/")}`,
    i.styles?.length && `styles=${i.styles.join("/")}`,
    i.notes && `notes="${i.notes.slice(0, 80)}"`,
  ]
    .filter(Boolean)
    .join(" | ");
}

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!geminiConfigured())
    return NextResponse.json({ error: "AI key not configured yet. The stylist will be back once the Gemini key is added." }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Missing mood, occasion or destination" }, { status: 400 });
  const b = parsed.data;

  const quota = await supabase.rpc("om_consume_ai_quota", { p_kind: "outfit" });
  if (quota.error) return NextResponse.json({ error: quota.error.message }, { status: 500 });
  if ((quota.data as number) < 0)
    return NextResponse.json({ error: "You've used today's 30 outfit generations. Fresh looks tomorrow." }, { status: 429 });

  const [profile, weather, itemsRes, fbRes] = await Promise.all([
    getProfile(supabase, user.id, user.user_metadata?.full_name),
    getWeather(b.destination.lat, b.destination.lon, b.local_time ?? null, b.destination.name),
    supabase.from("om_wardrobe_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(300),
    supabase
      .from("om_feedback")
      .select("rating, note, om_outfits(title, aesthetic:result->>aesthetic, item_ids)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const items = ((itemsRes.data ?? []) as WardrobeItem[]).filter((i) => i.category);
  const mode: "wardrobe" | "general" = items.length >= 2 && !b.force_general ? "wardrobe" : "general";

  const fbLines = (fbRes.data ?? []).map((f: Record<string, unknown>) => {
    const o = (Array.isArray(f.om_outfits) ? f.om_outfits[0] : f.om_outfits) as { title?: string; aesthetic?: string; item_ids?: string[] } | null;
    return `${f.rating === 1 ? "LIKED" : "DISLIKED"}: "${o?.title ?? "outfit"}" (${o?.aesthetic ?? ""})${o?.item_ids?.length ? ` items ${o.item_ids.join(",")}` : ""}${f.note ? ` note: ${f.note}` : ""}`;
  });

  const p = profile ?? {};
  const prompt = `USER PROFILE
- Name: ${p.display_name ?? "-"}
- Gender identity: ${p.gender_identity ?? "unspecified"}; dresses in: ${p.style_identity ?? "unspecified"}
- Body type: ${p.body_type ?? "-"}; height: ${p.height_cm ? p.height_cm + " cm" : "-"}
- Skin tone: ${p.skin_tone ?? "-"}; undertone: ${p.undertone ?? "-"}
- Budget: ${p.budget ?? "-"}
- Style preferences: ${(p.style_prefs ?? []).join(", ") || "-"}
- Loves colors: ${(p.fav_colors ?? []).join(", ") || "-"}
- Avoid colors: ${(p.avoid_colors ?? []).join(", ") || "-"}
- Modesty / comfort notes: ${p.modesty ?? "-"} ${p.notes ?? ""}

REQUEST
- Mood: ${b.mood}
- Occasion / plan: ${b.occasion}
- Destination: ${b.destination.name}${b.destination.country ? ", " + b.destination.country : ""}
- When (local at destination): ${b.local_time ?? "now"} ${b.time_of_day ? `(${b.time_of_day})` : ""}
- Extra notes: ${b.notes || "-"}

WEATHER THERE
${weather.source === "forecast"
    ? `${weather.summary}, ${weather.temp_c}°C (feels ${weather.feels_c}°C), day range ${weather.daily_min}–${weather.daily_max}°C, rain chance ${weather.precip_prob}%, wind ${weather.wind_kmh} km/h, humidity ${weather.humidity}%, UV ${weather.uv}, ${weather.is_day ? "daytime" : "night"}`
    : "Unavailable: dress for the typical climate of the destination and season."}

PAST FEEDBACK (learn from it; repeat what was liked, avoid what was disliked)
${fbLines.join("\n") || "none yet"}

${mode === "wardrobe" ? wardrobeRules() + "\n\nWARDROBE ITEMS\n" + items.map(itemLine).join("\n") : generalRules()}`;

  try {
    const { text } = await callGemini({ system: STYLIST_SYSTEM, parts: [{ text: prompt }], schema: OUTFIT_SCHEMA, temperature: 0.85, validateResponse: validateOutfitResponse });
    const result = parseJson<OutfitResult>(text);

    // Enforce: only the user's own item ids, no duplicates.
    const valid = new Set(items.map((i) => i.id));
    const used = new Set<string>();
    if (mode === "wardrobe") {
      result.pieces = result.pieces.filter((pc) => {
        if (!pc.item_id || !valid.has(pc.item_id) || used.has(pc.item_id)) return false;
        used.add(pc.item_id);
        return true;
      });
      result.alternatives = (result.alternatives ?? []).filter((a) => a.item_id && valid.has(a.item_id));
    } else {
      result.pieces = result.pieces.map((pc) => ({ ...pc, item_id: null }));
    }
    result.palette = (result.palette ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5);

    const { data: saved, error } = await supabase
      .from("om_outfits")
      .insert({
        user_id: user.id,
        title: result.title,
        mode,
        mood: b.mood,
        occasion: b.occasion,
        destination: b.destination,
        time_of_day: b.time_of_day,
        weather,
        request: b,
        result,
        item_ids: Array.from(used),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: saved.id, mode, remaining: quota.data, pinterest: pinterestUrl(result.pinterest_query) });
  } catch (e) {
    const status = e instanceof GeminiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed" }, { status });
  }
}
