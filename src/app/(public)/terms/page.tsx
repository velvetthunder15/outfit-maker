import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-5 pt-10 leading-relaxed">
      <h1 className="display text-blue text-5xl">Terms</h1>
      <p className="mt-6 text-muted">Last updated 4 November 2026</p>
      <div className="mt-8 space-y-5">
        <p>Outfit Maker is a beta styling tool. Suggestions are AI-generated opinions, not guarantees; weather forecasts can change.</p>
        <p>Upload only photos you own or have the right to use, and nothing illegal or explicit. Virtual try-on is for your own photos only.</p>
        <p>AI usage is limited to 30 outfits, 300 tags and 5 try-ons per account per day, and 300 wardrobe items per account.</p>
        <p>&ldquo;Pinterest inspo&rdquo; links open public Pinterest searches; Outfit Maker is not affiliated with Pinterest. Reference images are from the MIT-licensed nvzhuang project.</p>
        <p>We may change or end the service. You can delete your data at any time from your profile.</p>
      </div>
    </main>
  );
}
