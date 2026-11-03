import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-5 pt-10 leading-relaxed">
      <h1 className="display text-blue text-5xl">Privacy</h1>
      <p className="mt-6 text-muted">Last updated 4 November 2026</p>
      <div className="mt-8 space-y-5">
        <p><strong className="text-blue">What we store.</strong> Your Google or email sign-in identity, the style profile you fill in, photos of your wardrobe items (compressed WebP), the tags on them, the outfits generated for you, and your ratings.</p>
        <p><strong className="text-blue">Who can see it.</strong> Only you. Every table and the photo bucket are protected by row-level security tied to your account. Photos are served through short-lived signed links.</p>
        <p><strong className="text-blue">AI processing.</strong> To tag items and style outfits, item photos and your request are sent to Google&apos;s Gemini API. Selfies used for virtual try-on are sent to Gemini for that one request and are never stored by us.</p>
        <p><strong className="text-blue">Location.</strong> &ldquo;Use my location&rdquo; reads your coordinates once, only to fetch the weather. Weather comes from Open-Meteo.</p>
        <p><strong className="text-blue">Deleting.</strong> Profile → Delete my data removes your profile, wardrobe photos, outfits and ratings immediately.</p>
        <p><strong className="text-blue">No selling, no ads.</strong> We don&apos;t sell or share your data.</p>
      </div>
    </main>
  );
}
