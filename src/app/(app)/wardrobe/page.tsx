import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { withSignedUrls, WARDROBE_CAP } from "@/lib/storage";
import type { WardrobeItem } from "@/lib/types";
import { WardrobeClient } from "./wardrobe-client";

export const metadata: Metadata = { title: "Wardrobe" };

export default async function WardrobePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const { data } = await supabase.from("om_wardrobe_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(WARDROBE_CAP);
  const items = await withSignedUrls(supabase, (data ?? []) as WardrobeItem[]);
  return <WardrobeClient userId={user.id} initialItems={items} welcome={sp.welcome === "1"} aiReady={Boolean(process.env.GEMINI_API_KEY)} />;
}
