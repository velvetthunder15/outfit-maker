import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.is_saved === "boolean") {
    const { error } = await supabase.from("om_outfits").update({ is_saved: body.is_saved }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (body.rating === 1 || body.rating === -1) {
    const { error } = await supabase
      .from("om_feedback")
      .upsert({ user_id: user.id, outfit_id: id, rating: body.rating, note: body.note ?? null }, { onConflict: "user_id,outfit_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (body.rating === 0) {
    await supabase.from("om_feedback").delete().eq("outfit_id", id);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { error } = await supabase.from("om_outfits").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
