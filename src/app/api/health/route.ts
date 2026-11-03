import { NextResponse } from "next/server";
import { TEXT_MODEL } from "@/lib/gemini";

export const dynamic = "force-dynamic";

/** Health check. ?db=1 times 3 sequential Supabase REST round trips (anon, RLS returns nothing) from this function region.
 * ?ai=1 verifies the Gemini key with a free model-metadata call (no generation). */
export async function GET(req: Request) {
  const out: Record<string, unknown> = {
    ok: true,
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    ai: Boolean(process.env.GEMINI_API_KEY),
    model: TEXT_MODEL,
    region: process.env.VERCEL_REGION ?? null,
  };
  const sp = new URL(req.url).searchParams;
  if (sp.get("db") === "1" && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const ms: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/om_profiles?select=id&limit=1`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        cache: "no-store",
      }).then((r) => r.arrayBuffer());
      ms.push(Math.round(performance.now() - t));
    }
    out.db_roundtrips_ms = ms;
  }
  if (sp.get("ai") === "1" && process.env.GEMINI_API_KEY) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}`, {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
      cache: "no-store",
    });
    out.ai_key_valid = r.ok;
    if (!r.ok) out.ai_status = r.status;
  }
  return NextResponse.json(out);
}
