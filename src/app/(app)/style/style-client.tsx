"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, m } from "motion/react";
import { LocateFixed, MapPin, Search, Sparkles, Shirt } from "lucide-react";
import { MOODS, OCCASIONS } from "@/lib/options";
import type { GeoPlace, Weather } from "@/lib/types";
import { PromptChips } from "@/components/amicro/prompt-chips";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { BounceDots } from "@/components/amicro/bounce-dots";
import { ClassicToggle } from "@/components/amicro/classic-toggle";
import { WeatherCard } from "@/components/weather-card";

const TIMES = [
  { id: "morning", label: "Morning", h: 9 },
  { id: "afternoon", label: "Afternoon", h: 14 },
  { id: "evening", label: "Evening", h: 19 },
  { id: "night", label: "Late night", h: 22 },
];
const LOADING_LINES = ["Reading the forecast", "Pulling pieces from your wardrobe", "Balancing colours", "Choosing jewellery", "Final mirror check"];

function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function defaultTime() {
  const h = new Date().getHours();
  return h < 11 ? "morning" : h < 16 ? "afternoon" : h < 21 ? "evening" : "night";
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="py-8 border-t border-blue/12 first:border-t-0 first:pt-2">
      <h2 className="text-xl font-semibold text-blue" data-step={n}>{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function StyleClient({ name, homeCity, wardrobeCount, usedToday, aiReady }: { name: string | null; homeCity: string | null; wardrobeCount: number; usedToday: number; aiReady: boolean }) {
  const router = useRouter();
  const [mood, setMood] = useState<string[]>([]);
  const [occasion, setOccasion] = useState<string[]>([]);
  const [occasionText, setOccasionText] = useState("");
  const [query, setQuery] = useState(homeCity ?? "");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [place, setPlace] = useState<GeoPlace | null>(null);
  const [date, setDate] = useState(localDate());
  const [time, setTime] = useState(defaultTime());
  const [notes, setNotes] = useState("");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [wLoading, setWLoading] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [general, setGeneral] = useState(wardrobeCount < 2);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localIso = useMemo(() => `${date}T${String(TIMES.find((t) => t.id === time)?.h ?? 12).padStart(2, "0")}:00`, [date, time]);

  // geocode search
  useEffect(() => {
    if (place && query === place.name) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) return setResults([]);
    debounce.current = setTimeout(async () => {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const j = await r.json();
      setResults(j.results ?? []);
    }, 250);
  }, [query, place]);

  // weather whenever place/time changes
  useEffect(() => {
    if (!place) return;
    setWLoading(true);
    const label = [place.name, place.admin1].filter(Boolean).join(", ");
    fetch(`/api/weather?lat=${place.lat}&lon=${place.lon}&at=${encodeURIComponent(localIso)}&place=${encodeURIComponent(label)}`)
      .then((r) => r.json())
      .then((w) => setWeather(w))
      .catch(() => setWeather(null))
      .finally(() => setWLoading(false));
  }, [place, localIso]);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1800);
    return () => clearInterval(id);
  }, [busy]);

  function useMyLocation() {
    if (!navigator.geolocation) return setErr("Location isn't available in this browser.");
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const r = await fetch(`/api/weather?lat=${lat}&lon=${lon}&at=${encodeURIComponent(localIso)}`);
        const w = await r.json();
        const p = { name: w.place || "My location", lat, lon };
        setPlace(p);
        setQuery(p.name);
        setResults([]);
        setLocBusy(false);
      },
      () => {
        setLocBusy(false);
        setErr("Location permission was denied. Type the place instead.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }

  const occ = [occasion[0], occasionText.trim()].filter(Boolean).join(" — ");
  const ready = mood.length > 0 && occ && place && aiReady;

  async function generate() {
    if (!ready || !place) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mood: MOODS.find((m) => m.id === mood[0])?.label ?? mood[0],
          occasion: occ,
          notes,
          destination: { name: [place.name, place.admin1].filter(Boolean).join(", "), lat: place.lat, lon: place.lon, country: place.country },
          local_time: localIso,
          time_of_day: time,
          force_general: general,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong");
      router.push(`/outfits/${j.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="pt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="display-condensed text-blue text-[clamp(2.8rem,10vw,5rem)]">{name ? `Hey ${name},` : "Hey,"} where to?</h1>
        <div className="mt-6">
          <Step n={1} title="How are you feeling?">
            <PromptChips chips={MOODS} value={mood} onChange={setMood} size="lg" />
          </Step>
          <Step n={2} title="What's the plan?">
            <PromptChips chips={OCCASIONS} value={occasion} onChange={setOccasion} />
            <input className="field mt-4" placeholder="Add detail, e.g. rooftop birthday dinner, first date at a café" value={occasionText} onChange={(e) => setOccasionText(e.target.value)} maxLength={100} />
          </Step>
          <Step n={3} title="Where are you going?">
            <div className="relative">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="field !pl-11"
                  placeholder="City or area, e.g. Goa, Koregaon Park, London"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPlace(null); }}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls="place-results"
                  aria-expanded={results.length > 0 && !place}
                />
              </div>
              <AnimatePresence>
                {results.length > 0 && !place && (
                  <m.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute z-20 mt-2 w-full rounded-2xl bg-paper border border-blue/15 shadow-[0_20px_40px_-20px_rgba(15,47,73,0.45)] overflow-hidden" role="listbox" id="place-results">
                    {results.map((r) => (
                      <li key={`${r.lat},${r.lon}`}>
                        <button type="button" onClick={() => { setPlace(r); setQuery(r.name); setResults([]); }} className="w-full text-left px-4 py-3 hover:bg-blue/8 flex items-center gap-3">
                          <MapPin size={16} className="text-coral-deep shrink-0" />
                          <span><span className="font-medium">{r.name}</span> <span className="text-muted text-sm">{[r.admin1, r.country].filter(Boolean).join(", ")}</span></span>
                        </button>
                      </li>
                    ))}
                  </m.ul>
                )}
              </AnimatePresence>
            </div>
            <button type="button" onClick={useMyLocation} className="mt-3 nav-label text-blue inline-flex items-center gap-2 hover:text-coral-deep">
              {locBusy ? <BounceDots className="bg-blue scale-75" /> : <LocateFixed size={15} />} Use my location
            </button>
          </Step>
          <Step n={4} title="When?">
            <div className="flex flex-wrap items-center gap-3">
              <input type="date" className="field !w-auto" value={date} min={localDate()} max={localDate(15)} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
              <PromptChips chips={TIMES} value={[time]} onChange={(v) => v[0] && setTime(v[0])} size="sm" />
            </div>
            <input className="field mt-4" placeholder="Anything else? e.g. lots of walking, AC venue, want to wear my new sneakers" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
          </Step>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 self-start space-y-4">
        {place ? <WeatherCard w={weather} loading={wLoading} /> : (
          <div className="rounded-[22px] border border-dashed border-blue/25 p-5 text-sm text-muted min-h-[132px] flex items-center">Pick a destination to see the forecast for that hour.</div>
        )}
        <div className="rounded-[22px] bg-paper border border-blue/10 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Shirt size={20} className="text-blue" />
              <div>
                <p className="font-medium text-sm">{general ? "General idea" : "From my wardrobe"}</p>
                <p className="text-xs text-muted">{wardrobeCount} tagged item{wardrobeCount === 1 ? "" : "s"}</p>
              </div>
            </div>
            <ClassicToggle label="Use my wardrobe" on={!general} onChange={(v) => setGeneral(!v)} />
          </div>
          {wardrobeCount < 2 && (
            <p className="text-xs text-muted">Add at least two tagged items to style from your own clothes. <Link className="text-blue underline" href="/wardrobe">Open wardrobe</Link></p>
          )}
          <MagneticButton className="w-full" onClick={generate} disabled={!ready || busy || (!general && wardrobeCount < 2)}>
            {busy ? <BounceDots className="bg-blue-ink" /> : (<><Sparkles size={16} /> Style me</>)}
          </MagneticButton>
          <AnimatePresence mode="wait">
            {busy && (
              <m.p key={line} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-center text-sm text-blue" role="status">
                {LOADING_LINES[line]}…
              </m.p>
            )}
          </AnimatePresence>
          {!aiReady && <p className="text-sm text-coral-deep">AI key not configured on this deployment yet, so styling is paused.</p>}
          {!busy && aiReady && !ready && <p className="text-xs text-muted text-center">Pick a mood, a plan and a place.</p>}
          {err && <p className="text-sm text-coral-deep" role="alert">{err}</p>}
          <p className="text-xs text-muted text-center tabular">{Math.max(0, 30 - usedToday)} of 30 outfits left today</p>
        </div>
      </aside>
    </div>
  );
}
