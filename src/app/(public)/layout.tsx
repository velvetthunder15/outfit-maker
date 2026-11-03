import Link from "next/link";
import { Wordmark, SiteFooter } from "@/components/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* w-full: as a flex-column child with mx-auto the header used to shrink to its content and centre,
          which jammed "Sign in" against the wordmark on phones. */}
      <header className="w-full mx-auto max-w-6xl px-5 h-16 flex items-center justify-between gap-4">
        <Wordmark className="shrink-0 py-3" />
        <nav className="flex items-center gap-2 sm:gap-6 nav-label text-blue" aria-label="Site">
          <Link href="/#how" className="hidden sm:inline-flex items-center h-11 hover:text-blue-deep">How it works</Link>
          <Link href="/#wardrobe" className="hidden sm:inline-flex items-center h-11 hover:text-blue-deep">Wardrobe</Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-11 min-w-11 px-5 rounded-full border-[1.5px] border-blue/70 text-blue !tracking-[0.14em] transition-colors hover:border-blue hover:bg-blue hover:text-ivory active:bg-blue/10 touch-manipulation"
          >
            Sign in
          </Link>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
