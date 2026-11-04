# Outfit Maker

AI stylist that builds complete outfits **from your own wardrobe photos** for your mood, where you're going, and the live weather there. For men and women.

- **Automatic cutouts**: one Gemini call per photo finds every item (a flat-lay or a worn outfit becomes separate pieces) with tags and boxes; EdgeTAM (Apache-2.0) runs in a Web Worker via transformers.js (Apache-2.0) to cut each piece out onto pure white, 4:5, centred. Review step lets you untick wrong pieces; falls back to box crops or the original photo. "Clean up photos" reprocesses older items.
- **Photo-first wardrobe**: multi-upload clothes, jewellery and accessories. Photos are compressed in the browser (~1024px WebP, <150 KB, EXIF stripped, plus a 300px thumbnail) and stored in a private Supabase Storage bucket. Gemini vision auto-tags category, colours, pattern, fabric, formality, season and style; every tag is editable.
- **Style me**: mood chips, occasion, destination (Open-Meteo geocoding or "use my location"), date and time; the forecast for that place and hour is pulled automatically.
- **Outfits from your items only**: Gemini picks wardrobe item IDs (validated server-side), always finishing with jewellery/accessories where suitable. Missing pieces come with a Pinterest search link. Falls back to general recommendations when the wardrobe is empty.
- Why it works, colour story, styling tips, swaps, Pinterest inspo link, reference looks (womenswear, from [paipiange/nvzhuang](https://github.com/paipiange/nvzhuang), MIT, hot-linked via jsDelivr), pose ideas link, optional virtual try-on (Gemini image model).
- Save, rate (thumbs up/down feeds future suggestions), history, profile (gender/style identity, body type, skin tone/undertone, budget, styles, colours to love/avoid).
- Per-user daily AI limits (30 outfits, 300 tags, 5 try-ons) and a 300-item wardrobe cap enforced in Postgres.

## Stack
Next.js 15 (App Router, TypeScript, Tailwind v4) · Supabase (Postgres, Auth with Google + magic link, Storage, RLS on everything) · Google Gemini (`gemini-3.5-flash` with fallbacks, JSON-schema output) · Open-Meteo · Motion + vendored [Amicro](https://github.com/Subhan-code/Amicro--Micro-transitions-) micro-interactions.

## Setup
1. `cp .env.example .env.local` and fill in the values.
2. Run `supabase/migrations/0001_init.sql` then `0002_cutouts.sql` on your Supabase project. All objects are prefixed `om_` (bucket `om-wardrobe`) so it can share a project with other apps.
3. Enable the Google provider in Supabase Auth and add `https://<your-domain>/auth/callback` to the redirect allow list.
4. `npm install && npm run dev`

## Credits
Womenswear reference images: paipiange/nvzhuang (MIT). Micro-interactions: Amicro by Syed Subhan (MIT). Weather: Open-Meteo. Not affiliated with Pinterest.
