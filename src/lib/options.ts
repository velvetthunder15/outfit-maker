import type { Chip } from "@/components/amicro/prompt-chips";

export const MOODS: Chip[] = [
  { id: "confident", label: "Confident", icon: "😎" },
  { id: "cozy", label: "Cozy", icon: "🧸" },
  { id: "playful", label: "Playful", icon: "🎈" },
  { id: "romantic", label: "Romantic", icon: "🌹" },
  { id: "edgy", label: "Edgy", icon: "⚡" },
  { id: "calm", label: "Calm", icon: "🌿" },
  { id: "festive", label: "Festive", icon: "🪔" },
  { id: "powerful", label: "Boss mode", icon: "💼" },
  { id: "low-energy", label: "Low energy", icon: "🫠" },
  { id: "adventurous", label: "Adventurous", icon: "🧭" },
  { id: "artsy", label: "Artsy", icon: "🎨" },
  { id: "flirty", label: "Flirty", icon: "💋" },
];

export const OCCASIONS: Chip[] = [
  { id: "College / class", label: "College" },
  { id: "Office / work day", label: "Office" },
  { id: "Job interview", label: "Interview" },
  { id: "Date night", label: "Date night" },
  { id: "Brunch with friends", label: "Brunch" },
  { id: "Party / club night", label: "Party" },
  { id: "Indian wedding / sangeet", label: "Wedding" },
  { id: "Festival / pooja", label: "Festival" },
  { id: "Temple / religious visit", label: "Temple" },
  { id: "Beach day", label: "Beach" },
  { id: "Travel / airport", label: "Travel" },
  { id: "Gym / workout", label: "Gym" },
  { id: "Concert", label: "Concert" },
  { id: "Family dinner", label: "Family dinner" },
  { id: "Casual errands", label: "Errands" },
  { id: "Formal event / black tie", label: "Formal" },
];

export const GENDERS: Chip[] = ["Woman", "Man", "Non-binary", "Prefer not to say"].map((x) => ({ id: x, label: x }));
export const WEARS: Chip[] = [
  { id: "womenswear", label: "Womenswear" },
  { id: "menswear", label: "Menswear" },
  { id: "both", label: "Both / fluid" },
];
export const BODY_TYPES: Chip[] = ["Petite", "Slim", "Athletic", "Average", "Curvy", "Plus-size", "Tall", "Broad-shouldered", "Pear", "Apple", "Hourglass", "Rectangle", "Inverted triangle"].map((x) => ({ id: x, label: x }));
export const SKIN_TONES = [
  { id: "fair", label: "Fair", hex: "#F4D9C6" },
  { id: "light", label: "Light", hex: "#E9C3A2" },
  { id: "wheatish", label: "Wheatish", hex: "#D6A77A" },
  { id: "medium", label: "Medium", hex: "#C08A5B" },
  { id: "tan", label: "Tan", hex: "#A86F44" },
  { id: "brown", label: "Brown", hex: "#8A5632" },
  { id: "deep", label: "Deep", hex: "#5E3A22" },
  { id: "very deep", label: "Very deep", hex: "#3F2616" },
];
export const UNDERTONES: Chip[] = ["Warm", "Cool", "Neutral", "Not sure"].map((x) => ({ id: x, label: x }));
export const BUDGETS: Chip[] = [
  { id: "thrifty", label: "Thrifty" },
  { id: "mid-range", label: "Mid-range" },
  { id: "premium", label: "Premium" },
  { id: "luxury", label: "Luxury" },
];
export const STYLES: Chip[] = [
  "Old money", "Quiet luxury", "Clean girl", "Minimal", "Streetwear", "Y2K", "Coastal", "Boho", "Dark academia", "Athleisure",
  "Smart casual", "Indian ethnic", "Indo-western fusion", "K-fashion", "Gorpcore", "Classic", "Edgy", "Soft girl",
].map((x) => ({ id: x.toLowerCase(), label: x }));
export const COLORS = [
  { id: "black", hex: "#111111" }, { id: "white", hex: "#FAFAF7" }, { id: "ivory", hex: "#EAE6DE" }, { id: "beige", hex: "#D8C3A5" },
  { id: "camel", hex: "#B9875A" }, { id: "brown", hex: "#6B4226" }, { id: "grey", hex: "#8E9196" }, { id: "navy", hex: "#1F2F4D" },
  { id: "blue", hex: "#226192" }, { id: "sky", hex: "#9CC6E8" }, { id: "teal", hex: "#1F7A7A" }, { id: "green", hex: "#3E7D4F" },
  { id: "olive", hex: "#6B6B2E" }, { id: "sage", hex: "#A9B79A" }, { id: "yellow", hex: "#E9C33F" }, { id: "mustard", hex: "#C99A2E" },
  { id: "orange", hex: "#EF8557" }, { id: "rust", hex: "#A84B2A" }, { id: "red", hex: "#C0262D" }, { id: "maroon", hex: "#6E1B2A" },
  { id: "pink", hex: "#F0A6B9" }, { id: "fuchsia", hex: "#C2357A" }, { id: "lavender", hex: "#B9A6D8" }, { id: "purple", hex: "#5E3A87" },
  { id: "gold", hex: "#C9A24A" }, { id: "silver", hex: "#BFC3C7" },
];
export const colorHex = (name: string) => COLORS.find((c) => c.id === name.toLowerCase())?.hex;
