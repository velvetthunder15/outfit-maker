import type { Metadata } from "next";
import { GoogleButton } from "@/components/google-button";
import { MagicLinkForm } from "./magic-link";

export const metadata: Metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") ? sp.next : "/style";
  return (
    <main className="mx-auto max-w-md px-5 pt-10 md:pt-20">
      <h1 className="display text-blue text-[clamp(3rem,12vw,4.5rem)]">Sign in</h1>
      <p className="mt-4 text-lg">Your wardrobe, outfits and style profile stay private to your account.</p>
      {sp.error && (
        <p role="alert" className="mt-5 rounded-xl bg-coral/15 text-coral-deep px-4 py-3 text-sm">
          {sp.error === "not_configured" ? "Sign-in isn't configured on this deployment yet." : `Sign-in didn't finish: ${sp.error}. Try again.`}
        </p>
      )}
      <div className="mt-8">
        <GoogleButton next={next} />
      </div>
      <div className="my-8 flex items-center gap-4 text-muted nav-label">
        <span className="h-px flex-1 bg-blue/15" />or<span className="h-px flex-1 bg-blue/15" />
      </div>
      <MagicLinkForm next={next} />
    </main>
  );
}
