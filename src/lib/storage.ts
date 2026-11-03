import type { SupabaseClient } from "@supabase/supabase-js";
import type { WardrobeItem } from "./types";

export const BUCKET = "om-wardrobe";
export const WARDROBE_CAP = 300;

export async function withSignedUrls(supabase: SupabaseClient, items: WardrobeItem[], ttl = 3600): Promise<WardrobeItem[]> {
  const paths = Array.from(new Set(items.flatMap((i) => [i.image_path, i.thumb_path]).filter(Boolean) as string[]));
  if (!paths.length) return items;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, ttl);
  const map = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return items.map((i) => ({
    ...i,
    image_url: i.image_path ? map.get(i.image_path) ?? null : null,
    thumb_url: i.thumb_path ? map.get(i.thumb_path) ?? null : i.image_path ? map.get(i.image_path) ?? null : null,
  }));
}

export async function getProfile(supabase: SupabaseClient, userId: string, fallbackName?: string | null) {
  const { data } = await supabase.from("om_profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase
    .from("om_profiles")
    .upsert({ id: userId, display_name: fallbackName ?? null }, { onConflict: "id" })
    .select("*")
    .single();
  return created;
}
