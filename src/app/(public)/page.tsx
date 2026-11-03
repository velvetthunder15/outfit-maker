import Image from "next/image";
import Link from "next/link";
import { preload } from "react-dom";
import { ArrowUpRight, Camera, CloudSun, Sparkles } from "lucide-react";
import { TextReveal } from "@/components/amicro/text-reveal";
import { FadeUp } from "@/components/amicro/fade-up";
import { TiltCard } from "@/components/amicro/tilt-card";
import { GoogleButton } from "@/components/google-button";
import data from "@/data/nvzhuang.json";

const REF_IDS = ["SPR-0006", "AUT-0012", "SUM-0021", "WIN-0008", "PTY-0005", "SPR-0040"];
const CDN = "https://cdn.jsdelivr.net/gh/paipiange/nvzhuang@main/assets/thumbs";

export default function Landing() {
  // The blue paper behind the hero image is part of the LCP element; fetch it with the HTML, not after CSS.
  preload("/paper-blue.webp", { as: "image", fetchPriority: "high" });
  const rows = data as [string, string, string][];
  const refs = REF_IDS.map((id) => rows.find((r) => r[0] === id)).filter(Boolean) as [string, string, string][];
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pt-6 md:pt-12 grid gap-10 md:grid-cols-[1.15fr_1fr] items-center">
        <div>
          <h1 className="sr-only">Outfit Maker: your wardrobe, styled by AI for your mood, destination and the weather there</h1>
          <TextReveal
            className="display text-blue text-[clamp(3.6rem,13vw,7.25rem)]"
            lines={[{ text: "Dress" }, { text: "Dress", className: "outline-text" }, { text: "Dress" }]}
          />
          <FadeUp delay={0.2} className="mt-8 max-w-md">
            <p className="text-lg leading-relaxed text-ink">
              Photograph your clothes, jewellery and accessories once. Tell us your mood and where you&apos;re headed. We check the
              weather there and style a complete look from <em className="not-italic font-semibold text-blue">your own wardrobe</em>.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-1">
              <GoogleButton label="Start with Google" />
              <Link href="#how" className="nav-label text-blue inline-flex items-center gap-1 h-11 hover:text-coral-deep">
                How it works <ArrowUpRight size={14} />
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">For men and women. Free while in beta.</p>
          </FadeUp>
        </div>
        {/* LCP element: transform-only entrance (no opacity fade), so it is painted with the first frame. */}
        <FadeUp delay={0.1} fade={false} yOffset={20}>
          <TiltCard maxTilt={5}>
            <figure className="relative paper-blue rounded-[28px] p-4 sm:p-6 shadow-[0_24px_40px_-28px_rgba(15,47,73,0.55)]">
              <Image
                src="/hero-flatlay.webp"
                alt="Coral silk shirt, ivory wide-leg trousers, tan loafers, gold hoops, a gold watch and a woven coral bag laid out on blue paper"
                width={928}
                height={1152}
                priority
                fetchPriority="high"
                sizes="(min-width: 1152px) 470px, (min-width: 768px) 42vw, calc(100vw - 72px)"
                quality={70}
                className="rounded-[18px] w-full h-auto"
              />
              <figcaption className="absolute bottom-7 left-7 right-7 sm:bottom-9 sm:left-9 flex items-end justify-between text-ivory">
                <span className="nav-label bg-blue-ink/85 px-3 py-1.5 rounded-full">Pune · 31°C · Brunch</span>
                <span className="nav-label bg-coral text-blue-ink px-3 py-1.5 rounded-full">Confident</span>
              </figcaption>
            </figure>
          </TiltCard>
        </FadeUp>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 mt-28 scroll-mt-20">
        <h2 className="display-condensed text-blue text-[clamp(2.6rem,8vw,5rem)] max-w-3xl">Three inputs. One finished look.</h2>
        <ol className="mt-12 grid gap-px bg-blue/15 border-y border-blue/15 md:grid-cols-3">
          {[
            { icon: Camera, t: "Shoot your wardrobe", d: "Upload photos of everything: tops, kurtas, sarees, sneakers, jhumkas, watches, bags. AI tags category, colour, fabric and formality. Edit anything it gets wrong." },
            { icon: CloudSun, t: "Say where and how you feel", d: "Pick a mood, type where you're going and when. We pull the live forecast for that place and hour: temperature, rain chance, wind, UV." },
            { icon: Sparkles, t: "Get the outfit", d: "A complete look from your own photos, accessories included, with why it works, styling tips, swaps and a Pinterest inspo board. Thumbs up or down and it learns." },
          ].map((s) => (
            <li key={s.t} className="bg-ivory py-8 md:px-8 first:md:pl-0 last:md:pr-0">
              <s.icon size={22} strokeWidth={1.8} className="text-coral-deep" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold text-blue">{s.t}</h3>
              <p className="mt-2 leading-relaxed text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Wardrobe + references */}
      <section id="wardrobe" className="mx-auto max-w-6xl px-5 mt-28 grid gap-10 md:grid-cols-[1fr_1.2fr] items-start scroll-mt-20">
        <div>
          <h2 className="display-condensed text-blue text-[clamp(2.4rem,7vw,4.5rem)]">Your closet is the catalogue</h2>
          <p className="mt-5 text-lg leading-relaxed max-w-md">
            Outfit Maker only styles what you actually own, so every suggestion is wearable tonight. Missing a piece? It tells you what
            to look for and opens a Pinterest search for it.
          </p>
          <ul className="mt-6 space-y-2 text-muted">
            <li>Tuned to your skin tone, body type, budget and colours you love or avoid</li>
            <li>Old money, streetwear, clean girl, quiet luxury, Indian ethnic and fusion</li>
            <li>Optional virtual try-on with your selfie</li>
          </ul>
        </div>
        <div>
          <div className="grid grid-cols-3 gap-3">
            {refs.map(([id, , kw]) => (
              <div key={id} className="aspect-[3/4] overflow-hidden rounded-2xl bg-ivory-deep">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${CDN}/${id}.webp`} alt={kw} loading="lazy" decoding="async" width={300} height={400} className="h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-out-expo)] hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 mt-28">
        <div className="paper-blue rounded-[28px] px-6 py-14 md:px-14 text-ivory grid gap-8 md:grid-cols-[1fr_auto] items-center">
          <h2 className="display !leading-[0.98] text-[clamp(2.2rem,7vw,4.25rem)] text-ivory">What are you wearing tonight?</h2>
          <GoogleButton label="Style me" />
        </div>
      </section>
    </main>
  );
}
