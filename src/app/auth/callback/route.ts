import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/style";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/style";
  const errDesc = searchParams.get("error_description");
  if (errDesc) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errDesc)}`);
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { data: prof } = await supabase.from("om_profiles").select("onboarded").eq("id", data.user.id).maybeSingle();
      if (!prof) {
        await supabase.from("om_profiles").upsert({
          id: data.user.id,
          display_name: (data.user.user_metadata?.full_name as string) ?? data.user.email?.split("@")[0] ?? null,
        });
      }
      const dest = prof?.onboarded ? next : "/onboarding";
      return NextResponse.redirect(`${origin}${dest}`);
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error?.message ?? "Sign-in failed")}`);
  }
  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
