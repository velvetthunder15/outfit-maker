"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PromptChips } from "@/components/amicro/prompt-chips";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { BounceDots } from "@/components/amicro/bounce-dots";
import { BODY_TYPES, BUDGETS, COLORS, GENDERS, SKIN_TONES, STYLES, UNDERTONES, WEARS } from "@/lib/options";
import type { Profile } from "@/lib/types";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="py-7 border-t border-blue/12 first:border-t-0">
      <legend className="text-lg font-semibold text-blue">{title}</legend>
      {hint && <p className="text-sm text-muted mt-1">{hint}</p>}
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

function Swatches({ value, onChange, disabled = [] }: { value: string[]; onChange: (v: string[]) => void; disabled?: string[] }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {COLORS.map((c) => {
        const on = value.includes(c.id);
        const off = disabled.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            disabled={off}
            aria-pressed={on}
            aria-label={c.id}
            title={c.id}
            onClick={() => onChange(on ? value.filter((v) => v !== c.id) : [...value, c.id])}
            className={`relative h-10 w-10 rounded-full border transition-transform duration-200 hover:scale-110 active:scale-95 disabled:opacity-20 disabled:hover:scale-100 ${on ? "ring-2 ring-offset-2 ring-offset-ivory ring-blue border-transparent" : "border-blue/20"}`}
            style={{ background: c.hex }}
          >
            {on && <Check size={16} className="absolute inset-0 m-auto" color={["white", "ivory", "beige", "sky", "yellow", "silver", "pink", "lavender", "sage"].includes(c.id) ? "#16283A" : "#fff"} />}
          </button>
        );
      })}
    </div>
  );
}

export function ProfileForm({ initial, mode }: { initial: Partial<Profile> & { id: string }; mode: "onboarding" | "settings" }) {
  const router = useRouter();
  const [p, setP] = useState({
    display_name: initial.display_name ?? "",
    gender_identity: initial.gender_identity ?? "",
    style_identity: initial.style_identity ?? "",
    body_type: initial.body_type ?? "",
    height_cm: initial.height_cm ?? null,
    skin_tone: initial.skin_tone ?? "",
    undertone: initial.undertone ?? "",
    budget: initial.budget ?? "",
    style_prefs: initial.style_prefs ?? [],
    fav_colors: initial.fav_colors ?? [],
    avoid_colors: initial.avoid_colors ?? [],
    home_city: initial.home_city ?? "",
    modesty: initial.modesty ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP((s) => ({ ...s, [k]: v }));
  const one = (v: string) => (v ? [v] : []);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!p.style_identity) {
          setMsg({ ok: false, t: "Pick what you dress in so outfits fit you." });
          return;
        }
        setBusy(true);
        setMsg(null);
        const { error } = await createClient()
          .from("om_profiles")
          .upsert({ id: initial.id, ...p, height_cm: p.height_cm || null, onboarded: true }, { onConflict: "id" });
        setBusy(false);
        if (error) return setMsg({ ok: false, t: `Couldn't save: ${error.message}` });
        if (mode === "onboarding") router.push("/wardrobe?welcome=1");
        else {
          setMsg({ ok: true, t: "Saved. New outfits will use this." });
          router.refresh();
        }
      }}
    >
      <Section title="What should we call you?">
        <input className="field max-w-sm" value={p.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder="Your name" maxLength={60} />
      </Section>
      <Section title="You are" hint="Optional. Helps with fit and cut.">
        <PromptChips chips={GENDERS} value={one(p.gender_identity)} onChange={(v) => set("gender_identity", v[0] ?? "")} />
      </Section>
      <Section title="You dress in">
        <PromptChips chips={WEARS} value={one(p.style_identity)} onChange={(v) => set("style_identity", v[0] ?? "")} size="lg" />
      </Section>
      <Section title="Body type" hint="Pick the closest. Used only to balance proportions.">
        <PromptChips chips={BODY_TYPES} value={one(p.body_type)} onChange={(v) => set("body_type", v[0] ?? "")} size="sm" />
        <label className="mt-4 flex items-center gap-3 text-sm text-muted">
          Height (cm)
          <input type="number" min={120} max={230} className="field w-28" value={p.height_cm ?? ""} onChange={(e) => set("height_cm", e.target.value ? Number(e.target.value) : null)} />
        </label>
      </Section>
      <Section title="Skin tone & undertone" hint="For colours that make you glow.">
        <div className="flex flex-wrap gap-3">
          {SKIN_TONES.map((s) => (
            <button key={s.id} type="button" aria-pressed={p.skin_tone === s.id} onClick={() => set("skin_tone", p.skin_tone === s.id ? "" : s.id)} className="flex flex-col items-center gap-1.5 group">
              <span className={`h-11 w-11 rounded-full border border-blue/15 transition-transform group-hover:scale-110 ${p.skin_tone === s.id ? "ring-2 ring-blue ring-offset-2 ring-offset-ivory" : ""}`} style={{ background: s.hex }} />
              <span className="text-xs text-muted">{s.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <PromptChips chips={UNDERTONES} value={one(p.undertone)} onChange={(v) => set("undertone", v[0] ?? "")} size="sm" />
        </div>
      </Section>
      <Section title="Budget for new pieces">
        <PromptChips chips={BUDGETS} value={one(p.budget)} onChange={(v) => set("budget", v[0] ?? "")} />
      </Section>
      <Section title="Styles you love" hint="Pick as many as you like.">
        <PromptChips chips={STYLES} value={p.style_prefs} onChange={(v) => set("style_prefs", v)} multiple size="sm" />
      </Section>
      <Section title="Colours you love">
        <Swatches value={p.fav_colors} onChange={(v) => set("fav_colors", v)} disabled={p.avoid_colors} />
      </Section>
      <Section title="Colours to avoid">
        <Swatches value={p.avoid_colors} onChange={(v) => set("avoid_colors", v)} disabled={p.fav_colors} />
      </Section>
      <Section title="Anything else?" hint="Home city, modesty preferences, things you never wear.">
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="field" value={p.home_city} onChange={(e) => set("home_city", e.target.value)} placeholder="Home city (e.g. Pune)" maxLength={80} />
          <input className="field" value={p.modesty} onChange={(e) => set("modesty", e.target.value)} placeholder="e.g. no sleeveless, no heels" maxLength={200} />
        </div>
      </Section>
      <div className="sticky bottom-20 md:bottom-4 z-10 py-4 flex items-center gap-4">
        <MagneticButton type="submit" disabled={busy}>
          {busy ? <BounceDots className="bg-blue-ink" /> : mode === "onboarding" ? "Save & build my wardrobe" : "Save changes"}
        </MagneticButton>
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-blue" : "text-coral-deep"}`}>{msg.t}</p>}
      </div>
    </form>
  );
}
