"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, Trash2, X, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressForWardrobe } from "@/lib/image";
import { BUCKET, WARDROBE_CAP } from "@/lib/storage";
import { CATEGORIES, FORMALITY, SEASONS, type WardrobeItem } from "@/lib/types";
import { colorHex } from "@/lib/options";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { BounceDots } from "@/components/amicro/bounce-dots";
import { ShimmerLine } from "@/components/amicro/shimmer-line";
import { PromptChips } from "@/components/amicro/prompt-chips";

type Upload = { key: string; name: string; status: "compressing" | "uploading" | "error"; error?: string; preview?: string };

const CAT_LABEL: Record<string, string> = {
  top: "Tops", bottom: "Bottoms", dress: "Dresses & sets", outerwear: "Layers", shoes: "Shoes", jewellery: "Jewellery", watch: "Watches",
  bag: "Bags", belt: "Belts", eyewear: "Eyewear", hat: "Hats", scarf: "Scarves & dupattas", other: "Other",
};

export function WardrobeClient({ userId, initialItems, welcome, aiReady }: { userId: string; initialItems: WardrobeItem[]; welcome: boolean; aiReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<WardrobeItem[]>(initialItems);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<WardrobeItem | null>(null);
  const [banner, setBanner] = useState<string | null>(aiReady ? null : "AI tagging isn't switched on yet. Photos still save; you can tag items by hand.");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    items.forEach((i) => (c[i.category ?? "untagged"] = (c[i.category ?? "untagged"] ?? 0) + 1));
    return c;
  }, [items]);
  const shown = filter === "all" ? items : items.filter((i) => (i.category ?? "untagged") === filter);

  async function tag(ids: string[]) {
    if (!ids.length) return;
    setItems((s) => s.map((i) => (ids.includes(i.id) ? { ...i, tag_status: "pending" } : i)));
    for (let k = 0; k < ids.length; k += 4) {
      const chunk = ids.slice(k, k + 4);
      try {
        const r = await fetch("/api/wardrobe/tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: chunk }) });
        const j = await r.json();
        if (!r.ok) {
          setBanner(j.error ?? "Tagging failed");
          setItems((s) => s.map((i) => (chunk.includes(i.id) ? { ...i, tag_status: "failed" } : i)));
          continue;
        }
        setItems((s) =>
          s.map((i) => {
            const res = (j.results as ({ id: string; ok: boolean } & Partial<WardrobeItem>)[]).find((x) => x.id === i.id);
            if (!res) return i;
            if (!res.ok) return { ...i, tag_status: "failed" };
            const { ok: _ok, ...patch } = res as Record<string, unknown>;
            void _ok;
            return { ...i, ...(patch as Partial<WardrobeItem>), tag_status: "done" };
          })
        );
      } catch {
        setItems((s) => s.map((i) => (chunk.includes(i.id) ? { ...i, tag_status: "failed" } : i)));
      }
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const room = WARDROBE_CAP - items.length;
    if (room <= 0) return setBanner(`Your wardrobe is full (${WARDROBE_CAP} items). Remove a few to add more.`);
    const take = list.slice(0, room);
    if (list.length > room) setBanner(`Only ${room} more items fit. Added the first ${room}.`);
    const created: string[] = [];
    await Promise.all(
      take.map(async (file, idx) => {
        const key = `${Date.now()}-${idx}-${file.name}`;
        setUploads((u) => [...u, { key, name: file.name, status: "compressing", preview: URL.createObjectURL(file) }]);
        try {
          const { main, thumb, ext } = await compressForWardrobe(file);
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: "uploading" } : x)));
          const id = crypto.randomUUID();
          const path = `${userId}/${id}.${ext}`;
          const tpath = `${userId}/${id}_t.${ext}`;
          const ct = ext === "webp" ? "image/webp" : "image/jpeg";
          const up1 = await supabase.storage.from(BUCKET).upload(path, main, { contentType: ct, upsert: false });
          if (up1.error) throw new Error(up1.error.message);
          const up2 = await supabase.storage.from(BUCKET).upload(tpath, thumb, { contentType: ct, upsert: false });
          if (up2.error) throw new Error(up2.error.message);
          const { data, error } = await supabase
            .from("om_wardrobe_items")
            .insert({ id, user_id: userId, image_path: path, thumb_path: tpath, name: file.name.replace(/\.[^.]+$/, "").slice(0, 60), tag_status: aiReady ? "pending" : "manual" })
            .select("*")
            .single();
          if (error) {
            await supabase.storage.from(BUCKET).remove([path, tpath]);
            throw new Error(error.message.includes("wardrobe_full") ? "Wardrobe is full" : error.message);
          }
          const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls([path, tpath], 3600);
          const item = { ...(data as WardrobeItem), image_url: signed?.[0]?.signedUrl, thumb_url: signed?.[1]?.signedUrl };
          setItems((s) => [item, ...s]);
          setUploads((u) => u.filter((x) => x.key !== key));
          created.push(id);
        } catch (e) {
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: "error", error: e instanceof Error ? e.message : "Upload failed" } : x)));
        }
      })
    );
    if (aiReady) await tag(created);
  }

  async function remove(item: WardrobeItem) {
    setItems((s) => s.filter((i) => i.id !== item.id));
    setEditing(null);
    await supabase.from("om_wardrobe_items").delete().eq("id", item.id);
    const paths = [item.image_path, item.thumb_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  }

  async function save(item: WardrobeItem) {
    const { id, name, category, subcategory, colors, pattern, fabric, formality, seasons, styles, notes } = item;
    const status = item.tag_status === "done" ? "done" : "manual";
    setItems((s) => s.map((i) => (i.id === id ? { ...item, tag_status: status } : i)));
    setEditing(null);
    await supabase.from("om_wardrobe_items").update({ name, category, subcategory, colors, pattern, fabric, formality, seasons, styles, notes, tag_status: status }).eq("id", id);
  }

  const pct = Math.round((items.length / WARDROBE_CAP) * 100);
  const failed = items.filter((i) => i.tag_status === "failed").map((i) => i.id);

  return (
    <div className="pt-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display-condensed text-blue text-[clamp(2.8rem,10vw,5rem)]">Wardrobe</h1>
          <p className="mt-2 text-muted max-w-lg">
            {welcome ? "Now the fun part. " : ""}Add photos of every top, bottom, dress, shoe, piece of jewellery, watch and bag. One item per photo works best.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <div className="flex justify-between text-sm"><span className="text-muted">Wardrobe space</span><span className="tabular text-blue font-medium">{items.length} / {WARDROBE_CAP}</span></div>
          <div className="mt-2 h-1.5 rounded-full bg-blue/12 overflow-hidden">
            <motion.div className={`h-full rounded-full ${pct > 90 ? "bg-coral-deep" : "bg-blue"}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.8 }} />
          </div>
        </div>
      </div>

      {banner && (
        <div role="status" className="mt-6 flex items-start gap-3 rounded-2xl bg-coral/15 px-4 py-3 text-sm text-ink">
          <AlertCircle size={18} className="text-coral-deep shrink-0 mt-0.5" />
          <span className="flex-1">{banner}</span>
          <button onClick={() => setBanner(null)} aria-label="Dismiss" className="text-muted hover:text-ink"><X size={16} /></button>
        </div>
      )}

      {/* Drop zone */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={`mt-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 rounded-[24px] border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${dragOver ? "border-coral bg-coral/10" : "border-blue/25 bg-paper/60 hover:border-blue/50"}`}
      >
        <span className="paper-blue h-16 w-16 rounded-2xl grid place-items-center text-ivory shrink-0"><ImagePlus size={26} /></span>
        <span className="text-center sm:text-left flex-1">
          <span className="block text-lg font-semibold text-blue">Add photos</span>
          <span className="block text-sm text-muted">Select many at once. Up to 10 MB each; we shrink them to ~150 KB and strip location data.</span>
        </span>
        <span className="rounded-full bg-coral text-blue-ink font-semibold px-6 h-11 inline-flex items-center">Choose photos</span>
        <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
      </label>

      {/* Upload queue */}
      <AnimatePresence>
        {uploads.length > 0 && (
          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 space-y-2">
            {uploads.map((u) => (
              <li key={u.key} className="flex items-center gap-3 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {u.preview && <img src={u.preview} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                <span className="flex-1 truncate">{u.name}</span>
                {u.status === "error" ? (
                  <span className="text-coral-deep flex items-center gap-2">{u.error}<button onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} aria-label="Dismiss"><X size={14} /></button></span>
                ) : (
                  <span className="flex items-center gap-3 text-muted">{u.status === "compressing" ? "Compressing" : "Uploading"}<ShimmerLine className="w-16" /></span>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Filters */}
      {items.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-3 justify-between">
          <PromptChips
            size="sm"
            chips={[{ id: "all", label: `All ${items.length}` }, ...Object.keys(CAT_LABEL).filter((c) => counts[c]).map((c) => ({ id: c, label: `${CAT_LABEL[c]} ${counts[c]}` })), ...(counts.untagged ? [{ id: "untagged", label: `Untagged ${counts.untagged}` }] : [])]}
            value={[filter]}
            onChange={(v) => setFilter(v[0] ?? "all")}
          />
          {failed.length > 0 && aiReady && (
            <button onClick={() => tag(failed)} className="nav-label text-blue inline-flex items-center gap-1.5 hover:text-coral-deep"><RefreshCw size={14} /> Retry tagging {failed.length}</button>
          )}
        </div>
      )}

      {/* Grid */}
      {items.length === 0 && uploads.length === 0 ? (
        <div className="mt-14 text-center max-w-md mx-auto">
          <p className="display-condensed text-blue text-4xl">Empty closet, for now</p>
          <p className="mt-3 text-muted">Start with ten pieces you wear most: two tops, two bottoms, shoes, a watch or earrings, a bag. You can still get general outfit ideas meanwhile.</p>
          <Link href="/style" className="mt-5 inline-flex nav-label text-blue hover:text-coral-deep">Get a general outfit idea →</Link>
        </div>
      ) : (
        <motion.ul layout className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <AnimatePresence>
            {shown.map((item) => (
              <motion.li key={item.id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                <button onClick={() => setEditing(item)} className="group block w-full text-left">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-paper border border-blue/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {item.thumb_url && <img src={item.thumb_url} alt={item.name ?? "Wardrobe item"} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]" />}
                    {item.tag_status === "pending" && (
                      <div className="absolute inset-x-0 bottom-0 bg-ivory/90 backdrop-blur px-3 py-2 flex items-center gap-2 text-xs text-blue"><Sparkles size={12} /> Tagging<BounceDots className="bg-blue scale-50" /></div>
                    )}
                    {item.tag_status === "failed" && <div className="absolute top-2 right-2 rounded-full bg-coral text-blue-ink text-[0.65rem] font-semibold px-2 py-0.5">Needs tags</div>}
                    {item.category && <span className="absolute top-2 left-2 rounded-full bg-ivory/90 text-blue nav-label !text-[0.6rem] px-2 py-1">{item.category}</span>}
                  </div>
                  <p className="mt-2 text-sm font-medium truncate">{item.name ?? "Untitled"}</p>
                  <div className="mt-1 flex gap-1">
                    {item.colors.slice(0, 4).map((c) => (
                      <span key={c} title={c} className="h-3 w-3 rounded-full border border-blue/20" style={{ background: colorHex(c) ?? c }} />
                    ))}
                  </div>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {items.length >= 2 && (
        <div className="mt-10 flex justify-center">
          <Link href="/style"><MagneticButton variant="blue">Style me from my wardrobe</MagneticButton></Link>
        </div>
      )}

      <AnimatePresence>{editing && <EditSheet item={editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} onRetag={aiReady ? (i) => { setEditing(null); tag([i.id]); } : undefined} />}</AnimatePresence>
    </div>
  );
}

function EditSheet({ item, onClose, onSave, onDelete, onRetag }: { item: WardrobeItem; onClose: () => void; onSave: (i: WardrobeItem) => void; onDelete: (i: WardrobeItem) => void; onRetag?: (i: WardrobeItem) => void }) {
  const [d, setD] = useState<WardrobeItem>(item);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof WardrobeItem>(k: K, v: WardrobeItem[K]) => setD((s) => ({ ...s, [k]: v }));
  const list = (s: string) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 6);
  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-blue-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Edit item"
        className="fixed z-50 inset-x-0 bottom-0 max-h-[92dvh] md:inset-y-0 md:left-auto md:right-0 md:w-[440px] md:max-h-none overflow-y-auto bg-ivory rounded-t-[28px] md:rounded-none md:rounded-l-[28px] p-6 shadow-[0_-20px_60px_-20px_rgba(15,47,73,0.5)]"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-blue">Edit item</h2>
          <button onClick={onClose} aria-label="Close" className="h-10 w-10 grid place-items-center rounded-full hover:bg-blue/10"><X size={20} /></button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.image_url && <img src={item.image_url} alt="" className="mt-4 w-full max-h-72 object-contain rounded-2xl bg-paper" />}
        <div className="mt-5 space-y-4">
          <label className="block text-sm text-muted">Name<input className="field mt-1" value={d.name ?? ""} onChange={(e) => set("name", e.target.value)} /></label>
          <div>
            <p className="text-sm text-muted mb-2">Category</p>
            <PromptChips size="sm" chips={CATEGORIES.map((c) => ({ id: c, label: c }))} value={d.category ? [d.category] : []} onChange={(v) => set("category", (v[0] as WardrobeItem["category"]) ?? null)} />
          </div>
          <label className="block text-sm text-muted">Type (e.g. kurta, jhumka, chelsea boot)<input className="field mt-1" value={d.subcategory ?? ""} onChange={(e) => set("subcategory", e.target.value)} /></label>
          <label className="block text-sm text-muted">Colours (comma separated)<input className="field mt-1" value={d.colors.join(", ")} onChange={(e) => set("colors", list(e.target.value))} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-muted">Pattern<input className="field mt-1" value={d.pattern ?? ""} onChange={(e) => set("pattern", e.target.value)} /></label>
            <label className="block text-sm text-muted">Fabric<input className="field mt-1" value={d.fabric ?? ""} onChange={(e) => set("fabric", e.target.value)} /></label>
          </div>
          <div>
            <p className="text-sm text-muted mb-2">Formality</p>
            <PromptChips size="sm" chips={FORMALITY.map((c) => ({ id: c, label: c }))} value={d.formality ? [d.formality] : []} onChange={(v) => set("formality", v[0] ?? null)} />
          </div>
          <div>
            <p className="text-sm text-muted mb-2">Seasons</p>
            <PromptChips size="sm" multiple chips={SEASONS.map((c) => ({ id: c, label: c }))} value={d.seasons} onChange={(v) => set("seasons", v)} />
          </div>
          <label className="block text-sm text-muted">Styles (comma separated)<input className="field mt-1" value={d.styles.join(", ")} onChange={(e) => set("styles", list(e.target.value))} /></label>
          <label className="block text-sm text-muted">Notes<input className="field mt-1" value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. a bit tight, only for weddings" /></label>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <MagneticButton onClick={() => onSave(d)}>Save</MagneticButton>
          {onRetag && <button onClick={() => onRetag(item)} className="nav-label text-blue inline-flex items-center gap-1.5 px-3 h-11 hover:text-coral-deep"><Sparkles size={14} /> Re-tag with AI</button>}
          <button
            onClick={() => (confirm ? onDelete(item) : setConfirm(true))}
            className={`ml-auto inline-flex items-center gap-1.5 h-11 px-4 rounded-full text-sm font-medium transition-colors ${confirm ? "bg-coral-deep text-white" : "text-coral-deep hover:bg-coral/15"}`}
          >
            <Trash2 size={16} /> {confirm ? "Tap again to delete" : "Delete"}
          </button>
        </div>
      </motion.aside>
    </>
  );
}
