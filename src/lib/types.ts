export const CATEGORIES = [
  "top", "bottom", "dress", "outerwear", "shoes", "jewellery", "watch", "bag", "belt", "eyewear", "hat", "scarf", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const FORMALITY = ["casual", "smart-casual", "business", "formal", "festive", "athleisure"] as const;
export const SEASONS = ["spring", "summer", "monsoon", "autumn", "winter", "all-season"] as const;

export type Profile = {
  id: string;
  display_name: string | null;
  gender_identity: string | null;
  style_identity: string | null;
  body_type: string | null;
  height_cm: number | null;
  skin_tone: string | null;
  undertone: string | null;
  budget: string | null;
  style_prefs: string[];
  fav_colors: string[];
  avoid_colors: string[];
  modesty: string | null;
  home_city: string | null;
  notes: string | null;
  onboarded: boolean;
};

export type WardrobeItem = {
  id: string;
  user_id: string;
  image_path: string | null;
  thumb_path: string | null;
  name: string | null;
  category: Category | null;
  subcategory: string | null;
  colors: string[];
  pattern: string | null;
  fabric: string | null;
  formality: string | null;
  seasons: string[];
  styles: string[];
  notes: string | null;
  tag_status: "pending" | "done" | "failed" | "manual";
  source_path?: string | null; // original photo (cutouts); may be shared by pieces cut from one photo
  image_kind?: "photo" | "cutout";
  created_at: string;
  image_url?: string | null;
  thumb_url?: string | null;
};

export type Weather = {
  place: string;
  lat: number;
  lon: number;
  at: string; // ISO local time used
  temp_c: number | null;
  feels_c: number | null;
  precip_prob: number | null;
  precip_mm: number | null;
  wind_kmh: number | null;
  humidity: number | null;
  uv: number | null;
  code: number | null;
  summary: string;
  is_day: boolean | null;
  daily_min: number | null;
  daily_max: number | null;
  source: "forecast" | "unavailable";
};

export type OutfitPiece = {
  slot: string;
  item_id?: string | null;
  description: string;
  reason: string;
};

export type OutfitResult = {
  title: string;
  aesthetic: string;
  vibe: string;
  pieces: OutfitPiece[];
  color_story: string;
  palette: string[];
  why_it_works: string;
  styling_tips: string[];
  alternatives: { slot: string; item_id?: string | null; description: string }[];
  missing_pieces: { slot: string; description: string; pinterest_query: string }[];
  weather_note: string;
  grooming_note?: string;
  pinterest_query: string;
  reference_keywords: string;
};

export type GeoPlace = { name: string; lat: number; lon: number; country?: string; admin1?: string; timezone?: string };
