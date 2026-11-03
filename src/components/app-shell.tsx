"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Sparkles, Shirt, Bookmark, UserRound } from "lucide-react";
import { Wordmark } from "./brand";

const NAV = [
  { href: "/style", label: "Style me", icon: Sparkles },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/settings", label: "Profile", icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/") || (href === "/saved" && path.startsWith("/outfits"));
  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <header className="sticky top-0 z-30 bg-ivory/85 backdrop-blur-md border-b border-blue/10">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          <Wordmark />
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`relative nav-label px-4 py-2 rounded-full transition-colors ${active(n.href) ? "text-ivory" : "text-blue hover:text-blue-deep"}`}>
                {active(n.href) && (
                  <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-blue -z-10" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                )}
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5">{children}</main>
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-paper/95 backdrop-blur-md border-t border-blue/15 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = active(n.href);
            return (
              <Link key={n.href} href={n.href} className={`relative flex flex-col items-center gap-1 py-2.5 text-[0.68rem] font-medium tracking-wide ${on ? "text-blue" : "text-muted"}`}>
                {on && <motion.span layoutId="tab-dot" className="absolute top-0 h-[3px] w-10 rounded-b-full bg-coral" />}
                <Icon size={20} strokeWidth={on ? 2.2 : 1.7} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
