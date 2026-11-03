import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/storage";

/**
 * Deletes ALL Outfit Maker data for the signed-in user: om_* rows and wardrobe photos.
 * The sign-in identity lives in a Supabase project shared with another app, so the auth
 * user itself is intentionally not deleted here (that would remove their other account too).
 */
export async function DELETE() {
  const { supabase, user } = await requireUser({ strict: true });
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  for (;;) {
    const { data: files } = await supabase.storage.from(BUCKET).list(user.id, { limit: 1000 });
    if (!files?.length) break;
    await supabase.storage.from(BUCKET).remove(files.map((f) => `${user.id}/${f.name}`));
    if (files.length < 1000) break;
  }
  await supabase.from("om_feedback").delete().eq("user_id", user.id);
  await supabase.from("om_outfits").delete().eq("user_id", user.id);
  await supabase.from("om_wardrobe_items").delete().eq("user_id", user.id);
  await supabase.from("om_profiles").delete().eq("id", user.id);
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
