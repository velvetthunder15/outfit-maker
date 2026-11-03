import { NextResponse } from "next/server";
import { TEXT_MODEL } from "@/lib/gemini";

export const dynamic = "force-dynamic";

/** Health check. ?ai=1 verifies the Gemini key with a free model-metadata call (no generation). */
export async function GET(req: Request) {
  const out: Record<string, unknown> = {
    ok: true,
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    ai: Boolean(process.env.GEMINI_API_KEY),
    model: TEXT_MODEL,
  };
  if (new URL(req.url).searchParams.get("ai") === "1" && process.env.GEMINI_API_KEY) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}`, {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
      cache: "no-store",
    });
    out.ai_key_valid = r.ok;
    if (!r.ok) out.ai_status = r.status;
  }
  return NextResponse.json(out);
}
