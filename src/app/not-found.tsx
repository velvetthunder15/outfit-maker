import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-6 min-h-dvh flex flex-col">
      <Wordmark />
      <div className="flex-1 flex flex-col justify-center py-16">
        <p className="display text-blue text-[clamp(5rem,22vw,12rem)] leading-none">4<span className="outline-text">0</span>4</p>
        <h1 className="mt-6 text-2xl font-semibold text-blue">This page isn&apos;t in the wardrobe.</h1>
        <p className="mt-2 text-muted">The link may be old, or the outfit was deleted.</p>
        <div className="mt-8 flex gap-4">
          <Link href="/style" className="rounded-full bg-coral text-blue-ink font-semibold px-6 h-12 inline-flex items-center hover:bg-[#f39469]">Style me</Link>
          <Link href="/" className="rounded-full border border-blue/40 text-blue font-semibold px-6 h-12 inline-flex items-center hover:border-blue">Home</Link>
        </div>
      </div>
    </main>
  );
}
