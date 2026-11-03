"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LazyMotion, MotionConfig, m } from "motion/react";
import { Sparkles, Shirt, Bookmark, UserRound } from "lucide-react";
import { Wordmark } from "./brand";

const NAV = [
  { href: "/style", label: "Style me", icon: Sparkles },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/settings", label: "Profile", icon: UserRound },
];

// Motion features are code-split: the shell paints without them; domMax (layoutId for the gliding tab
// indicator) streams in as its own chunk. `m` components only, so nothing else from motion is bundled.
const loadFeatures = () => import("@/lib/motion-features").then((r) => r.default);
const glide = { type: "spring", stiffness: 520, damping: 40, mass: 0.7 } as const;

/** Lives in app/(app)/layout.tsx, so it persists across Style / Wardrobe / Saved / Profile and never remounts. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/") || (href === "/saved" && path.startsWith("/outfits"));
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <div className="min-h-dvh pb-24 md:pb-0">
          <header className="sticky top-0 z-30 bg-ivory/[0.97] border-b border-blue/10">
            <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
              <Wordmark className="py-3" />
              <nav className="hidden md:flex items-center gap-1" aria-label="Main">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    prefetch
                    aria-current={active(n.href) ? "page" : undefined}
                    className={`relative isolate nav-label px-4 h-11 inline-flex items-center rounded-full transition-colors duration-200 ${active(n.href) ? "text-ivory" : "text-blue hover:text-blue-deep"}`}
                  >
                    {active(n.href) && <m.span layoutId="nav-pill" transition={glide} className="absolute inset-0 rounded-full bg-blue -z-10" />}
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-5">{children}</main>
          <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-paper border-t border-blue/15 pb-[env(safe-area-inset-bottom)]">
            <div className="grid grid-cols-4">
              {NAV.map((n) => {
                const Icon = n.icon;
                const on = active(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    prefetch
                    aria-current={on ? "page" : undefined}
                    className={`relative flex flex-col items-center justify-center gap-1 min-h-14 py-2 text-[0.68rem] font-medium tracking-wide touch-manipulation transition-colors duration-200 ${on ? "text-blue" : "text-muted"}`}
                  >
                    {on && <m.span layoutId="tab-dot" transition={glide} className="absolute top-0 h-[3px] w-10 rounded-b-full bg-coral" />}
                    <span className={`transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${on ? "-translate-y-px scale-110" : ""}`}>
                      <Icon size={20} strokeWidth={on ? 2.2 : 1.7} />
                    </span>
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
