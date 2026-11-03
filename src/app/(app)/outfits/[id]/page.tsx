import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getProfile, withSignedUrls } from "@/lib/storage";
import { matchRefs } from "@/lib/refs";
import { pinterestUrl } from "@/lib/pinterest";
import type { OutfitResult, WardrobeItem, Weather } from "@/lib/types";
import { OutfitView } from "./outfit-view";

export const metadata: Metadata = { title: "Your outfit" };

export default async function OutfitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: outfit } = await supabase.from("om_outfits").select("*").eq("id", id).maybeSingle();
  if (!outfit) notFound();
  const result = outfit.result as OutfitResult;
  const ids = Array.from(new Set([...(outfit.item_ids ?? []), ...(result.alternatives ?? []).map((a) => a.item_id).filter(Boolean)])) as string[];
  const [{ data: items }, { data: fb }, profile] = await Promise.all([
    ids.length ? supabase.from("om_wardrobe_items").select("*").in("id", ids) : Promise.resolve({ data: [] as WardrobeItem[] }),
    supabase.from("om_feedback").select("rating").eq("outfit_id", id).maybeSingle(),
    getProfile(supabase, user.id),
  ]);
  const signed = await withSignedUrls(supabase, (items ?? []) as WardrobeItem[]);
  const weather = outfit.weather as Weather | null;
  const wearsWomens = !profile?.style_identity || profile.style_identity !== "menswear";
  const occ = `${outfit.occasion ?? ""}`.toLowerCase();
  const refs = wearsWomens
    ? matchRefs(result.reference_keywords || result.pieces.map((p) => p.description).join(" "), {
        tempC: weather?.temp_c,
        party: /party|club|wedding|sangeet|formal|cocktail|reception/.test(occ),
        beach: /beach|pool/.test(occ),
        limit: 6,
      })
    : [];
  return (
    <OutfitView
      outfit={{ id: outfit.id, mode: outfit.mode, mood: outfit.mood, occasion: outfit.occasion, destination: outfit.destination, created_at: outfit.created_at, is_saved: outfit.is_saved }}
      result={result}
      items={signed}
      weather={weather}
      rating={(fb?.rating as 1 | -1 | undefined) ?? 0}
      refs={refs}
      pinterest={pinterestUrl(result.pinterest_query || result.title)}
      aiReady={Boolean(process.env.GEMINI_API_KEY)}
    />
  );
}
