import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`display text-[1.05rem] text-blue tracking-tight no-underline ${className}`} aria-label="Outfit Maker home">
      Outfit<span className="text-coral">/</span>Maker
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-blue/20">
      <div className="mx-auto max-w-6xl px-5 py-10 grid gap-6 md:grid-cols-[1fr_auto] text-sm text-muted">
        <div className="space-y-3 max-w-xl">
          <p>
            Womenswear visual references from{" "}
            <a className="underline text-blue" href="https://github.com/paipiange/nvzhuang" target="_blank" rel="noreferrer">
              paipiange/nvzhuang
            </a>{" "}
            (MIT). Micro-interactions from{" "}
            <a className="underline text-blue" href="https://github.com/Subhan-code/Amicro--Micro-transitions-" target="_blank" rel="noreferrer">
              Amicro
            </a>{" "}
            (MIT). Weather by{" "}
            <a className="underline text-blue" href="https://open-meteo.com" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
            . Pose ideas:{" "}
            <a className="underline text-blue" href="https://ai-pose-gallery.pages.dev/" target="_blank" rel="noreferrer">
              AI Pose Gallery
            </a>
            .
          </p>
          <p>Outfit Maker is not affiliated with Pinterest. &ldquo;Pinterest inspo&rdquo; links open a public Pinterest search.</p>
        </div>
        <nav className="flex gap-6 items-start text-sm font-medium text-blue">
          <Link href="/privacy" className="underline underline-offset-4 hover:text-coral-deep py-1">Privacy</Link>
          <Link href="/terms" className="underline underline-offset-4 hover:text-coral-deep py-1">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
