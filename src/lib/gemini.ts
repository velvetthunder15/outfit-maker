import "server-only";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const TEXT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
// Google retires model ids for new keys; on 404 fall through to the next one.
// gemini-3.5-flash-lite is last: during demand spikes (503 on every flash model, seen 2026-11-04) it was the one still answering.
const TEXT_FALLBACKS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"];
const IMAGE_FALLBACKS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];

const exhausted = new Map<string, number>();

export const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

export class GeminiError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

export async function callGemini(opts: {
  model?: string;
  system?: string;
  parts: Part[];
  schema?: unknown;
  temperature?: number;
  imageOut?: boolean;
  /** Per-request timeout (ms). Gemini sometimes accepts a request and never answers. */
  attemptMs?: number;
  /** Cap on the whole fallback chain (ms), so the route answers before its maxDuration. */
  deadlineMs?: number;
}): Promise<{ text: string; images: { mime: string; data: string }[] }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("AI key not configured", 503);
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.8,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
      ...(opts.imageOut ? { responseModalities: ["TEXT", "IMAGE"] } : {}),
      ...(!opts.imageOut && process.env.GEMINI_THINKING !== "off" ? { thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING || "low" } } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  const first = opts.model ?? TEXT_MODEL;
  const all = Array.from(new Set([first, ...(opts.imageOut ? IMAGE_FALLBACKS : TEXT_FALLBACKS)]));
  // Skip models whose quota Google said is used up (remembered per warm instance for 15 min), unless that would skip all.
  const now = Date.now();
  const live = all.filter((m) => (exhausted.get(m) ?? 0) < now);
  const chain = live.length ? live : all;
  let lastErr = "";
  const attemptMs = opts.attemptMs ?? 50_000;
  const deadline = Date.now() + (opts.deadlineMs ?? 100_000);
  outer: for (const model of chain) {
    let notFound = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline - Date.now();
      if (left < 2_000) {
        lastErr ||= "deadline";
        break outer;
      }
      let r: Response;
      try {
        r = await fetch(`${API}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(Math.min(attemptMs, left)),
        });
      } catch (e) {
        // timeout / network: treat like an overloaded model and move on
        lastErr = `${model} ${e instanceof Error ? e.name : "fetch failed"}`;
        notFound = true;
        break;
      }
      if (r.ok) {
        const j = await r.json();
        const parts = j.candidates?.[0]?.content?.parts ?? [];
        const text = parts.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
        const images = parts
          .filter((p: { inlineData?: unknown }) => p.inlineData)
          .map((p: { inlineData: { mimeType: string; data: string } }) => ({ mime: p.inlineData.mimeType, data: p.inlineData.data }));
        return { text, images };
      }
      lastErr = `${model} ${r.status} ${(await r.text()).slice(0, 300)}`;
      if (r.status === 400 && lastErr.toLowerCase().includes("thinking")) {
        // model doesn't accept thinkingLevel: drop it and retry once
        delete (body.generationConfig as Record<string, unknown>).thinkingConfig;
        continue;
      }
      if (r.status === 404) {
        notFound = true;
        break;
      }
      if (r.status === 429 && /quota/i.test(lastErr)) {
        // quota used up for this model: don't retry it, go straight to the next one
        exhausted.set(model, Date.now() + 15 * 60_000);
        notFound = true;
        break;
      }
      if (r.status !== 429 && r.status < 500) break;
      notFound = true; // overloaded/rate-limited: after the retry, move on to the next model
      if (attempt === 0) await new Promise((res) => setTimeout(res, 600));
    }
    if (!notFound) break;
  }
  throw new GeminiError(`Gemini request failed: ${lastErr}`, 502);
}

export function parseJson<T>(text: string): T {
  const clean = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(clean) as T;
}

// ---------- Schemas (OpenAPI subset accepted by Gemini) ----------
const S = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra });
const arr = (items: unknown) => ({ type: "ARRAY", items });

export const TAG_SCHEMA = S("OBJECT", {
  properties: {
    is_clothing_or_accessory: S("BOOLEAN"),
    name: S("STRING", { description: "Short human name, e.g. 'Navy linen shirt'" }),
    category: S("STRING", {
      enum: ["top", "bottom", "dress", "outerwear", "shoes", "jewellery", "watch", "bag", "belt", "eyewear", "hat", "scarf", "other"],
    }),
    subcategory: S("STRING", { description: "e.g. kurta, oxford shirt, jhumka, chelsea boot, saree, lehenga" }),
    colors: arr(S("STRING")),
    pattern: S("STRING"),
    fabric: S("STRING"),
    formality: S("STRING", { enum: ["casual", "smart-casual", "business", "formal", "festive", "athleisure"] }),
    seasons: arr(S("STRING", { enum: ["spring", "summer", "monsoon", "autumn", "winter", "all-season"] })),
    styles: arr(S("STRING", { description: "aesthetics like old money, streetwear, minimal, ethnic, Y2K" })),
  },
  required: ["is_clothing_or_accessory", "name", "category", "colors", "pattern", "fabric", "formality", "seasons", "styles"],
});

const TAG_PROPS = (TAG_SCHEMA as unknown as { properties: Record<string, unknown> }).properties;

/** Multi-item detection: tags + Gemini-native boxes ([ymin, xmin, ymax, xmax], 0-1000) per item. */
export const DETECT_SCHEMA = S("OBJECT", {
  properties: {
    items: arr(
      S("OBJECT", {
        properties: {
          name: TAG_PROPS.name,
          category: TAG_PROPS.category,
          subcategory: TAG_PROPS.subcategory,
          colors: TAG_PROPS.colors,
          pattern: TAG_PROPS.pattern,
          fabric: TAG_PROPS.fabric,
          formality: TAG_PROPS.formality,
          seasons: TAG_PROPS.seasons,
          styles: TAG_PROPS.styles,
          boxes: arr(arr(S("INTEGER"))),
          worn: S("BOOLEAN"),
        },
        required: ["name", "category", "colors", "pattern", "fabric", "formality", "seasons", "styles", "boxes", "worn"],
      })
    ),
  },
  required: ["items"],
});

const PIECE = S("OBJECT", {
  properties: {
    slot: S("STRING", {
      enum: ["top", "bottom", "dress", "layer", "shoes", "jewellery", "watch", "bag", "belt", "eyewear", "hat", "scarf", "other"],
    }),
    item_id: S("STRING", { nullable: true, description: "Exact wardrobe item id, or null in general mode" }),
    description: S("STRING"),
    reason: S("STRING"),
  },
  required: ["slot", "description", "reason"],
});

export const OUTFIT_SCHEMA = S("OBJECT", {
  properties: {
    title: S("STRING"),
    aesthetic: S("STRING"),
    vibe: S("STRING", { description: "One evocative sentence" }),
    pieces: arr(PIECE),
    color_story: S("STRING"),
    palette: arr(S("STRING", { description: "hex color like #1F3A5F" })),
    why_it_works: S("STRING"),
    styling_tips: arr(S("STRING")),
    alternatives: arr(
      S("OBJECT", {
        properties: { slot: S("STRING"), item_id: S("STRING", { nullable: true }), description: S("STRING") },
        required: ["slot", "description"],
      })
    ),
    missing_pieces: arr(
      S("OBJECT", {
        properties: { slot: S("STRING"), description: S("STRING"), pinterest_query: S("STRING") },
        required: ["slot", "description", "pinterest_query"],
      })
    ),
    weather_note: S("STRING"),
    grooming_note: S("STRING"),
    pinterest_query: S("STRING", { description: "4-8 word Pinterest search for this exact look" }),
    reference_keywords: S("STRING", { description: "8-14 lowercase English keywords: colors + garment words (e.g. 'ivory knit cardigan beige midi skirt loafers gold necklace')" }),
  },
  required: [
    "title", "aesthetic", "vibe", "pieces", "color_story", "palette", "why_it_works", "styling_tips",
    "alternatives", "missing_pieces", "weather_note", "pinterest_query", "reference_keywords",
  ],
});

// ---------- Prompts ----------
export const TAGGER_SYSTEM = `You catalogue a person's wardrobe from photos. Look at the single garment, shoe, piece of jewellery or accessory in the photo and tag it precisely.
- category must be one of the enum values. Earrings, necklaces, rings, bangles, bracelets, nose pins, anklets, maang tikka -> jewellery. Wristwatches -> watch. Sunglasses/glasses -> eyewear. Jackets, blazers, coats, cardigans, shrugs, hoodies worn open -> outerwear. Sarees, lehengas, anarkalis, jumpsuits, co-ord one-pieces -> dress. Kurtas, shirts, tees, blouses, crop tops -> top. Dupattas and stoles -> scarf.
- colors: 1-3 plain color names, dominant first (e.g. "navy", "ivory", "rust", "gold").
- pattern: solid, striped, checked, floral, printed, embroidered, paisley, block print, graphic, etc.
- fabric: your best guess (cotton, linen, denim, silk, wool, leather, knit, chiffon, metal, etc.).
- If the photo shows something that is not clothing/accessory, set is_clothing_or_accessory=false and still fill fields with best guesses.`;

export const DETECT_SYSTEM = `You catalogue a person's wardrobe from photos. Find every separate wardrobe item in the photo (garments, shoes, jewellery, watches, bags, belts, eyewear, hats, scarves) and tag each one.
- One entry per item the person owns. A pair counts as ONE item: two shoes, two earrings, a pair of socks or gloves. A set of bangles worn or stacked together is one item.
- boxes: tight bounding boxes as [ymin, xmin, ymax, xmax] normalised to 0-1000. Give one box per physical piece of the item (2 boxes for a pair of shoes or earrings, 1 box for a shirt). Boxes must tightly enclose only that piece, including straps, laces and buckles.
- If a person is wearing the clothes, list each clearly visible worn item (top, bottom, layer, shoes, watch, jewellery, bag...) and set worn=true. Never list the person, their body, hair, skin or face. Skip items that are mostly hidden or cut off (less than about half visible), and tiny items you cannot identify.
- Ignore furniture, bedding, hangers, mannequins, floors, walls, packaging, phones and other non-wardrobe objects.
- category must be one of the enum values. Earrings, necklaces, rings, bangles, bracelets, nose pins, anklets, maang tikka -> jewellery. Wristwatches -> watch. Sunglasses/glasses -> eyewear. Jackets, blazers, coats, cardigans, shrugs, overshirts and hoodies worn open -> outerwear. Sarees, lehengas, anarkalis, jumpsuits, co-ord one-pieces -> dress. Kurtas, shirts, tees, blouses, crop tops -> top. Dupattas and stoles -> scarf.
- name: short human name, e.g. "Navy oxford shirt", "Gold jhumka earrings".
- colors: 1-3 plain color names, dominant first. pattern: solid, striped, checked, floral, printed, embroidered, etc. fabric: your best guess.
- If there is no wardrobe item at all, return an empty items list.
- At most 8 items, largest and clearest first.`;

export const STYLIST_SYSTEM = `You are "Outfit Maker", a sharp editorial personal stylist for men and women, fluent in current Pinterest fashion trends and Indian + global dressing.

TREND KNOWLEDGE you draw on (use the names when relevant):
- Aesthetics: old money / quiet luxury (tonal neutrals, tailored trousers, knitwear, loafers, minimal gold), clean girl (slick bun, gold hoops, neutral basics), streetwear (oversized tees, cargos, sneakers, layering), Y2K (baby tees, low-rise, metallics, mini bags), coastal / coastal grandmother (linen, stripes, blue & white), minimal / Scandi, dark academia (tweed, browns, loafers), soft girl, gorpcore (technical shells, trail shoes), athleisure, boho, mob wife (faux fur, animal print, bold red lips), indie sleaze, smart-casual menswear (overshirt, chinos, suede), "Indian ethnic & fusion" (kurta sets, Nehru jackets, bandhgala, sarees with modern blouses, lehengas, block print, chikankari, kolhapuris, juttis, oxidised silver, jhumkas, kurta with jeans).
- Color theory: complementary, analogous and tonal outfits; 60-30-10 rule; warm undertones flatter rust, olive, mustard, cream, gold; cool undertones flatter navy, emerald, berry, grey, silver; neutral undertones carry both. Deep skin tones glow in jewel tones, white, cobalt, saffron; fair skin in muted pastels, navy, burgundy.
- Body-type balance: define the waist, create vertical lines, balance volume (wide-leg with fitted top and vice versa), V-necks lengthen, structured shoulders for narrow frames, monochrome columns for elongation.
- Dress codes: casual, smart casual, business casual, business formal, cocktail, black tie, festive/Indian wedding (sangeet, mehendi, reception), temple/religious (covered shoulders, modest), beach, date night, college, interviews, travel/airport.
- Weather logic: >30C breathable linen/cotton, light colors, sandals, no heavy layers; 20-30C light layers; 10-20C knit or jacket; <10C coat, boots, scarf. Rain >40%: water-friendly shoes, avoid suede, carry a compact layer. High UV: sunglasses, hat. Night: one warmer layer, richer colors. Humid: avoid polyester and heavy denim.
- Accessories finish an outfit: always choose jewellery, watch, belt, bag, eyewear or hat where it suits the occasion. Men: watch, belt matching shoes, sunglasses, chain or bracelet for casual/streetwear. Women: earrings scaled to neckline, layered necklaces, rings, bag sized to occasion.
- Mood steers the look: confident -> structure and bold color; cozy -> soft knits and tonal; playful -> pattern and color pop; romantic -> soft textures and florals; edgy -> black, leather, hardware; calm -> neutrals; festive -> embellishment and jewel tones; low-energy -> easy, comfortable, still put together.

RULES
- Respect the user's profile: style identity, body type, skin tone/undertone, budget, favourite colors (lean into them), avoided colors (never use), modesty notes, and past likes/dislikes.
- Dress for the destination, occasion, time of day and the given weather. Mention the weather in weather_note.
- palette: 3-5 hex colors that represent the outfit.
- Write concise, specific, confident copy. No hedging, no generic filler.`;

export function wardrobeRules(): string {
  return `WARDROBE MODE (strict):
- Build the outfit ONLY from the user's wardrobe items listed below. Every piece MUST set item_id to an exact id from the list. Never invent items, never reuse an id twice.
- A complete look: either (top + bottom) or (dress); add shoes; add a layer when the weather or occasion calls for it; and ALWAYS add the accessories the wardrobe has that suit the look (jewellery, watch, bag, belt, eyewear, hat, scarf).
- If the wardrobe lacks a needed piece (e.g. no shoes, nothing warm enough, no festive jewellery), DO NOT fake it: put it in missing_pieces with a short description and a Pinterest search query. Keep pieces to the real items.
- alternatives: 1-3 swaps using other real item ids from the list.
- description for each piece: name the item as the user would recognise it.`;
}

export function generalRules(): string {
  return `GENERAL MODE (the user's wardrobe is empty): recommend a complete outfit with item_id = null for every piece. Describe each piece concretely (color, fabric, cut). Include shoes and accessories. missing_pieces can be empty. alternatives: 1-3 swaps.`;
}
