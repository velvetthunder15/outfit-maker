import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/style", "/outfits", "/saved", "/wardrobe", "/settings", "/onboarding"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  if (!url || !anon) {
    if (isProtected) {
      const to = request.nextUrl.clone();
      to.pathname = "/login";
      to.searchParams.set("error", "not_configured");
      return NextResponse.redirect(to);
    }
    return response;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Local JWT verification (ES256 via cached JWKS) instead of a getUser() network call on every request.
  // getClaims() still refreshes an expired session through getSession(), and writes the new cookies above.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;

  if (!user && isProtected) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }
  if (user && path === "/login") {
    const to = request.nextUrl.clone();
    to.pathname = "/style";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}
