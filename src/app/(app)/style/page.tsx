import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/storage";
import { StyleClient } from "./style-client";

export const metadata: Metadata = { title: "Style me" };

export default async function StylePage() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const profile = await getProfile(supabase, user.id, user.user_metadata?.full_name);
  if (profile && !profile.onboarded) redirect("/onboarding");
  const { count } = await supabase.from("om_wardrobe_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).not("category", "is", null);
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase.from("om_ai_usage").select("count").eq("user_id", user.id).eq("kind", "outfit").eq("day", today).maybeSingle();
  return (
    <StyleClient
      name={profile?.display_name?.split(" ")[0] ?? null}
      homeCity={profile?.home_city ?? null}
      wardrobeCount={count ?? 0}
      usedToday={usage?.count ?? 0}
      aiReady={Boolean(process.env.GEMINI_API_KEY)}
    />
  );
}
