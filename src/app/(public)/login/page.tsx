import type { Metadata } from "next";
import { GoogleButton } from "@/components/google-button";
import { MagicLinkForm } from "./magic-link";

export const metadata: Metadata = { title: "Sign in" };

function friendlyError(e: string) {
  if (/pkce|code verifier/i.test(e)) return "That sign-in link was opened in a different browser or expired. Start again here.";
  if (/missing_code/.test(e)) return "Sign-in was cancelled. Try again.";
  return `Sign-in didn't finish: ${e.slice(0, 120)}`;
}

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") ? sp.next : "/style";
  return (
    <main className="mx-auto max-w-md px-5 pt-10 md:pt-20">
      <h1 className="display text-blue text-[clamp(3rem,12vw,4.5rem)]">Sign in</h1>
      <p className="mt-4 text-lg">Your wardrobe, outfits and style profile stay private to your account.</p>
      {sp.error && (
        <p role="alert" className="mt-5 rounded-xl bg-coral/15 text-coral-deep px-4 py-3 text-sm">
          {sp.error === "not_configured" ? "Sign-in isn't configured on this deployment yet." : friendlyError(sp.error)}
        </p>
      )}
      <div className="mt-8">
        <GoogleButton next={next} />
      </div>
      <div className="my-8 flex items-center gap-4 text-blue nav-label">
        <span className="h-px flex-1 bg-blue/35" />or<span className="h-px flex-1 bg-blue/35" />
      </div>
      <MagicLinkForm next={next} />
    </main>
  );
}
