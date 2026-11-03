import "server-only";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const TEXT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

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
}): Promise<{ text: string; images: { mime: string; data: string }[] }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("AI key not configured", 503);
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.8,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
      ...(opts.imageOut ? { responseModalities: ["TEXT", "IMAGE"] } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  const model = opts.model ?? TEXT_MODEL;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${API}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const j = await r.json();
      const parts = j.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: { text?: string }) => p.text ?? "").join("");
      const images = parts
        .filter((p: { inlineData?: unknown }) => p.inlineData)
        .map((p: { inlineData: { mimeType: string; data: string } }) => ({ mime: p.inlineData.mimeType, data: p.inlineData.data }));
      return { text, images };
    }
    lastErr = `${r.status} ${(await r.text()).slice(0, 300)}`;
    if (r.status !== 429 && r.status < 500) break;
    await new Promise((res) => setTimeout(res, 1200));
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
