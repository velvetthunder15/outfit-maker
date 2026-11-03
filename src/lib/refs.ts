import data from "@/data/nvzhuang.json";

// [id, category, keywords] from github.com/paipiange/nvzhuang (MIT). Lingerie/sexy categories excluded at build time.
type Row = [string, string, string];
const ROWS = data as Row[];
const CDN = "https://cdn.jsdelivr.net/gh/paipiange/nvzhuang@main/assets";

export type RefImage = { id: string; category: string; keywords: string; thumb: string; full: string };

const STOP = new Set(["a", "an", "the", "and", "with", "for", "of", "in", "on", "to", "style", "look", "outfit", "wear"]);

function seasonFromTemp(t: number | null | undefined): string | null {
  if (t == null) return null;
  if (t >= 26) return "summer";
  if (t >= 18) return "spring";
  if (t >= 10) return "autumn";
  return "winter";
}

export function matchRefs(keywords: string, opts: { tempC?: number | null; party?: boolean; beach?: boolean; limit?: number } = {}): RefImage[] {
  const words = keywords
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const season = seasonFromTemp(opts.tempC);
  const scored = ROWS.filter(([, cat]) => cat !== "swim" || opts.beach).map(([id, cat, kw]) => {
    const kws = kw.split(" ");
    let s = 0;
    for (const w of words) if (kws.includes(w)) s += 2;
    else if (kws.some((k) => k.startsWith(w) || w.startsWith(k))) s += 1;
    if (season && cat === season) s += 2.5;
    if (opts.party && cat === "party") s += 3;
    if (opts.beach && cat === "swim") s += 2;
    return { id, cat, kw, s };
  });
  scored.sort((a, b) => b.s - a.s || a.id.localeCompare(b.id));
  return scored.slice(0, opts.limit ?? 6).filter((x) => x.s > 0).map((x) => ({
    id: x.id,
    category: x.cat,
    keywords: x.kw,
    thumb: `${CDN}/thumbs/${x.id}.webp`,
    full: `${CDN}/img/${x.id}.webp`,
  }));
}
