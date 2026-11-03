import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export const supabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component; middleware refreshes the session
          }
        },
      },
    }
  );
}


/** The fields the app reads off a user. */
export type AppUser = { id: string; email: string | null; user_metadata: Record<string, unknown> & { full_name?: string } };

/**
 * Fast path: verify the session JWT locally with the project's published ES256 keys (getClaims; JWKS cached
 * in memory) instead of a network round trip to Supabase Auth on every page. Deduplicated per request with
 * React cache(), so a page and its Suspense children share one lookup. RLS still guards every query.
 * Pass { strict: true } for destructive actions to re-check the user against the Auth server (getUser).
 */
const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const c = data?.claims;
  const user: AppUser | null =
    !error && c?.sub ? { id: c.sub, email: (c.email as string | undefined) ?? null, user_metadata: (c.user_metadata ?? {}) as AppUser["user_metadata"] } : null;
  return { supabase, user };
});

export async function requireUser(opts: { strict?: boolean } = {}) {
  if (!opts.strict) return getSessionUser();
  const supabase = await createClient();
  const {
    data: { user: u },
  } = await supabase.auth.getUser();
  const user: AppUser | null = u ? { id: u.id, email: u.email ?? null, user_metadata: u.user_metadata ?? {} } : null;
  return { supabase, user };
}
