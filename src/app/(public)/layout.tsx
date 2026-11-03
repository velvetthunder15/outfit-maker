import Link from "next/link";
import { Wordmark, SiteFooter } from "@/components/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
        <Wordmark />
        <nav className="flex items-center gap-6 nav-label text-blue">
          <Link href="/#how" className="hidden sm:inline hover:text-blue-deep">How it works</Link>
          <Link href="/#wardrobe" className="hidden sm:inline hover:text-blue-deep">Wardrobe</Link>
          <Link href="/login" className="hover:text-coral-deep">Sign in</Link>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
