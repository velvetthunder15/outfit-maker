"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Bookmark, BookmarkCheck, ThumbsDown, ThumbsUp, ExternalLink, RefreshCw, Trash2, Camera, Plus, X } from "lucide-react";
import type { OutfitResult, WardrobeItem, Weather } from "@/lib/types";
import type { RefImage } from "@/lib/refs";
import { pinterestUrl } from "@/lib/pinterest";
import { WeatherCard } from "@/components/weather-card";
import { TiltCard } from "@/components/amicro/tilt-card";
import { FadeUp } from "@/components/amicro/fade-up";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { BounceDots } from "@/components/amicro/bounce-dots";

type O = { id: string; mode: "wardrobe" | "general"; mood: string; occasion: string; destination: { name: string } | null; created_at: string; is_saved: boolean };

const SLOT_ORDER = ["dress", "top", "layer", "bottom", "shoes", "jewellery", "watch", "bag", "belt", "eyewear", "hat", "scarf", "other"];

export function OutfitView({ outfit, result, items, weather, rating: initialRating, refs, pinterest, aiReady }: { outfit: O; result: OutfitResult; items: WardrobeItem[]; weather: Weather | null; rating: 1 | -1 | 0; refs: RefImage[]; pinterest: string; aiReady: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(outfit.is_saved);
  const [rating, setRating] = useState<1 | -1 | 0>(initialRating);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tryon, setTryon] = useState(false);
  const byId = new Map(items.map((i) => [i.id, i]));
  const pieces = [...result.pieces].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  const main = pieces.filter((p) => !["jewellery", "watch", "bag", "belt", "eyewear", "hat", "scarf"].includes(p.slot));
  const acc = pieces.filter((p) => ["jewellery", "watch", "bag", "belt", "eyewear", "hat", "scarf"].includes(p.slot));

  const patch = (body: object) => fetch(`/api/outfits/${outfit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  return (
    <div className="pt-8">
      <FadeUp>
        <p className="nav-label text-coral-deep">{outfit.mood} · {outfit.destination?.name}</p>
        <h1 className="mt-3 display-condensed text-blue text-[clamp(2.6rem,9vw,5.5rem)] max-w-4xl">{result.title}</h1>
        <p className="mt-3 text-lg max-w-2xl">{result.vibe}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-blue text-ivory px-3 py-1">{result.aesthetic}</span>
          <span className="rounded-full border border-blue/25 px-3 py-1 text-blue">{outfit.occasion}</span>
          {outfit.mode === "general" && <span className="rounded-full bg-coral/20 text-coral-deep px-3 py-1">General idea</span>}
        </div>
      </FadeUp>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <motion.button whileTap={{ scale: 0.92 }} onClick={() => { setSaved(!saved); patch({ is_saved: !saved }); }} className={`h-11 px-5 rounded-full inline-flex items-center gap-2 text-sm font-semibold transition-colors ${saved ? "bg-blue text-ivory" : "border border-blue/30 text-blue hover:border-blue"}`}>
          {saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />} {saved ? "Saved" : "Save"}
        </motion.button>
        <div className="inline-flex rounded-full border border-blue/30 overflow-hidden" role="group" aria-label="Rate this outfit">
          {([1, -1] as const).map((v) => {
            const on = rating === v;
            const I = v === 1 ? ThumbsUp : ThumbsDown;
            return (
              <motion.button key={v} whileTap={{ scale: 0.85 }} aria-pressed={on} aria-label={v === 1 ? "Love it" : "Not for me"} onClick={() => { const nv = on ? 0 : v; setRating(nv); patch({ rating: nv }); }} className={`h-11 w-12 grid place-items-center transition-colors ${on ? (v === 1 ? "bg-coral text-blue-ink" : "bg-blue text-ivory") : "text-blue hover:bg-blue/8"}`}>
                <motion.span animate={on ? { rotate: [0, -14, 10, 0], scale: [1, 1.25, 1] } : {}} transition={{ duration: 0.45 }}><I size={17} /></motion.span>
              </motion.button>
            );
          })}
        </div>
        <a href={pinterest} target="_blank" rel="noreferrer" className="h-11 px-5 rounded-full inline-flex items-center gap-2 text-sm font-semibold bg-coral text-blue-ink hover:bg-[#f39469] transition-colors">
          Pinterest inspo <ExternalLink size={15} />
        </a>
        <Link href="/style" className="h-11 px-4 rounded-full inline-flex items-center gap-2 text-sm text-blue hover:bg-blue/8"><RefreshCw size={16} /> New look</Link>
        <button onClick={async () => { if (!confirmDel) return setConfirmDel(true); await fetch(`/api/outfits/${outfit.id}`, { method: "DELETE" }); router.push("/saved"); }} className={`h-11 px-4 rounded-full inline-flex items-center gap-2 text-sm ${confirmDel ? "bg-coral-deep text-white" : "text-muted hover:text-coral-deep"}`}>
          <Trash2 size={16} /> {confirmDel ? "Tap to delete" : ""}
        </button>
      </div>
      <AnimatePresence>{rating !== 0 && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 text-sm text-muted">Got it. Future outfits will lean {rating === 1 ? "toward" : "away from"} this.</motion.p>}</AnimatePresence>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          {/* The outfit */}
          <section aria-label="Outfit pieces">
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {main.map((p, i) => <PieceCard key={i} p={p} item={p.item_id ? byId.get(p.item_id) : undefined} i={i} big />)}
            </ul>
            {acc.length > 0 && (
              <>
                <h2 className="mt-10 text-lg font-semibold text-blue">Finish with</h2>
                <ul className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {acc.map((p, i) => <PieceCard key={i} p={p} item={p.item_id ? byId.get(p.item_id) : undefined} i={i + main.length} />)}
                </ul>
              </>
            )}
          </section>

          <section className="mt-12 grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-blue">Why it works</h2>
              <p className="mt-2 leading-relaxed">{result.why_it_works}</p>
              <h3 className="mt-6 text-lg font-semibold text-blue">Colour story</h3>
              <div className="mt-3 flex h-12 rounded-xl overflow-hidden">
                {result.palette.map((c) => <span key={c} className="flex-1" style={{ background: c }} title={c} />)}
              </div>
              <p className="mt-3 text-muted leading-relaxed">{result.color_story}</p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-blue">Styling tips</h2>
              <ul className="mt-2 space-y-3">
                {result.styling_tips.map((t, i) => (
                  <li key={i} className="flex gap-3 leading-relaxed"><span className="mt-2.5 h-1.5 w-1.5 rounded-full bg-coral shrink-0" />{t}</li>
                ))}
              </ul>
              {result.grooming_note && <p className="mt-4 text-sm text-muted">{result.grooming_note}</p>}
            </div>
          </section>

          {result.alternatives?.length > 0 && (
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-blue">Swap options</h2>
              <ul className="mt-4 grid sm:grid-cols-2 gap-3">
                {result.alternatives.map((a, i) => {
                  const it = a.item_id ? byId.get(a.item_id) : undefined;
                  return (
                    <li key={i} className="flex items-center gap-3 rounded-2xl bg-paper border border-blue/10 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {it?.thumb_url ? <img src={it.thumb_url} alt="" className="h-16 w-14 rounded-xl object-cover" /> : <span className="h-16 w-14 rounded-xl bg-ivory-deep" />}
                      <div className="min-w-0"><p className="nav-label text-coral-deep">{a.slot}</p><p className="text-sm">{a.description}</p></div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {result.missing_pieces?.length > 0 && (
            <section className="mt-12 rounded-[24px] border border-dashed border-coral/60 p-6">
              <h2 className="text-lg font-semibold text-blue">Missing from your wardrobe</h2>
              <ul className="mt-3 space-y-3">
                {result.missing_pieces.map((m, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-3">
                    <span><span className="nav-label text-coral-deep mr-2">{m.slot}</span>{m.description}</span>
                    <a href={pinterestUrl(m.pinterest_query)} target="_blank" rel="noreferrer" className="nav-label text-blue inline-flex items-center gap-1 hover:text-coral-deep">Pinterest inspo <ExternalLink size={13} /></a>
                  </li>
                ))}
              </ul>
              <Link href="/wardrobe" className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue underline"><Plus size={14} /> Own something like it? Add a photo</Link>
            </section>
          )}

          {refs.length > 0 && (
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-blue">Reference looks</h2>
              <p className="text-sm text-muted">Similar silhouettes and colours from the nvzhuang womenswear library.</p>
              <ul className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-3">
                {refs.map((r) => (
                  <li key={r.id}>
                    <a href={r.full} target="_blank" rel="noreferrer" className="block aspect-[3/4] overflow-hidden rounded-xl bg-ivory-deep group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.thumb} alt={r.keywords} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 self-start">
          {weather && <WeatherCard w={weather} compact />}
          {result.weather_note && <p className="text-sm leading-relaxed px-1">{result.weather_note}</p>}
          <div className="rounded-[22px] bg-paper border border-blue/10 p-5 space-y-3">
            <p className="font-medium text-blue">Shooting a fit pic?</p>
            <p className="text-sm text-muted">Browse pose ideas that suit this outfit.</p>
            <a href="https://ai-pose-gallery.pages.dev/" target="_blank" rel="noreferrer" className="nav-label text-blue inline-flex items-center gap-1 hover:text-coral-deep">Pose ideas <ExternalLink size={13} /></a>
          </div>
          {aiReady && (
            <div className="rounded-[22px] paper-blue text-ivory p-5 space-y-3">
              <p className="font-medium">Virtual try-on <span className="text-xs text-ivory/70">beta</span></p>
              <p className="text-sm text-ivory/85">Upload a full-length photo and see yourself in this look. Your photo isn&apos;t stored.</p>
              <button onClick={() => setTryon(true)} className="h-10 px-4 rounded-full bg-coral text-blue-ink text-sm font-semibold inline-flex items-center gap-2"><Camera size={16} /> Try it on</button>
            </div>
          )}
        </aside>
      </div>
      <AnimatePresence>{tryon && <TryOn outfitId={outfit.id} onClose={() => setTryon(false)} />}</AnimatePresence>
    </div>
  );
}

function PieceCard({ p, item, i, big = false }: { p: OutfitResult["pieces"][number]; item?: WardrobeItem; i: number; big?: boolean }) {
  return (
    <motion.li initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      <TiltCard maxTilt={big ? 6 : 4}>
        <div className={`relative overflow-hidden rounded-2xl ${item?.image_url ? "bg-paper" : "paper-blue"} border border-blue/10 aspect-[4/5]`}>
          {item?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt={item.name ?? p.description} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full p-4 flex items-end text-ivory"><p className={`${big ? "text-lg" : "text-sm"} font-semibold leading-snug`}>{p.description}</p></div>
          )}
          <span className="absolute top-2 left-2 rounded-full bg-ivory/90 text-blue nav-label !text-[0.6rem] px-2 py-1">{p.slot}</span>
        </div>
      </TiltCard>
      {item && <p className={`mt-2 font-medium ${big ? "" : "text-sm"} truncate`}>{item.name ?? p.description}</p>}
      {big && <p className="mt-1 text-sm text-muted leading-snug">{p.reason}</p>}
    </motion.li>
  );
}

function TryOn({ outfitId, onClose }: { outfitId: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function onFile(f: File) {
    setErr(null);
    setBusy(true);
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
      const s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s);
      c.height = Math.round(bmp.height * s);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const b64 = c.toDataURL("image/jpeg", 0.85).split(",")[1];
      const r = await fetch("/api/tryon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outfit_id: outfitId, selfie: b64, mime: "image/jpeg" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Try-on failed");
      setImg(j.image);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Try-on failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-blue-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div role="dialog" aria-modal="true" aria-label="Virtual try-on" className="fixed z-50 inset-x-4 top-[8dvh] mx-auto max-w-md rounded-[28px] bg-ivory p-6" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-blue">Virtual try-on</h2><button onClick={onClose} aria-label="Close" className="h-10 w-10 grid place-items-center rounded-full hover:bg-blue/10"><X size={20} /></button></div>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="You wearing the outfit (AI generated)" className="mt-4 w-full rounded-2xl" />
        ) : (
          <label className="mt-4 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-blue/25 p-10 cursor-pointer hover:border-blue/50">
            {busy ? <><BounceDots /><span className="text-sm text-blue">Dressing you up, about 15 seconds</span></> : <><Camera className="text-blue" /><span className="text-sm text-muted text-center">Full-length photo, good light, plain background works best</span><span className="rounded-full bg-coral text-blue-ink font-semibold px-5 h-10 inline-flex items-center">Choose photo</span></>}
            <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        )}
        {err && <p className="mt-3 text-sm text-coral-deep" role="alert">{err}</p>}
        <p className="mt-3 text-xs text-muted">AI-generated preview. 5 per day.</p>
        {img && <div className="mt-4"><MagneticButton variant="ghost" onClick={() => setImg(null)}>Try another photo</MagneticButton></div>}
      </motion.div>
    </>
  );
}
