"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, m } from "motion/react";
import { ImagePlus, Trash2, X, RefreshCw, Sparkles, AlertCircle, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { processPhoto, warmCutter, type Piece } from "@/lib/cutout/client";
import { PieceReview, type Job } from "./piece-review";
import { BUCKET, WARDROBE_CAP } from "@/lib/storage";
import { CATEGORIES, FORMALITY, SEASONS, type WardrobeItem } from "@/lib/types";
import { colorHex } from "@/lib/options";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { BounceDots } from "@/components/amicro/bounce-dots";
import { PromptChips } from "@/components/amicro/prompt-chips";

const CLEANUP_BATCH = 20;

/** Row fields from a detected piece (tags already sanitised by /api/wardrobe/detect). */
function tagPatch(p: Piece) {
  const t = p.tags!;
  return {
    name: t.name,
    category: t.category,
    subcategory: t.subcategory,
    colors: t.colors,
    pattern: t.pattern,
    fabric: t.fabric,
    formality: t.formality,
    seasons: t.seasons,
    styles: t.styles,
    tag_status: "done" as const,
  };
}

const PAGE = 24;

const CAT_LABEL: Record<string, string> = {
  top: "Tops", bottom: "Bottoms", dress: "Dresses & sets", outerwear: "Layers", shoes: "Shoes", jewellery: "Jewellery", watch: "Watches",
  bag: "Bags", belt: "Belts", eyewear: "Eyewear", hat: "Hats", scarf: "Scarves & dupattas", other: "Other",
};

export function WardrobeClient({ userId, initialItems, welcome, aiReady }: { userId: string; initialItems: WardrobeItem[]; welcome: boolean; aiReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<WardrobeItem[]>(initialItems);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [model, setModel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
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
  const filtered = filter === "all" ? items : items.filter((i) => (i.category ?? "untagged") === filter);
  // Paginate the grid: render 24 tiles, grow by 24 when the sentinel nears the viewport.
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filter]);
  const shown = filtered.slice(0, limit);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = filtered.length > limit;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, limit]);

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

  const patchJob = (key: string, patch: Partial<Job> | ((j: Job) => Partial<Job>)) =>
    setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...(typeof patch === "function" ? patch(j) : patch) } : j)));

  /** Photos are processed one at a time (memory on phones); detection + embedding overlap inside each. */
  function enqueue(job: Job, input: () => Promise<File | Blob>, hint?: { name?: string | null; category?: string | null }) {
    queue.current = queue.current.then(async () => {
      try {
        const res = await processPhoto(await input(), {
          hint,
          onStage: (stage, frac) => patchJob(job.key, { stage, frac }),
          onModel: (f) => setModel(f),
        });
        let pieces = res.pieces;
        let note = res.note;
        if (job.mode === "cleanup") {
          // Only a real cutout replaces an existing photo.
          pieces = pieces.filter((p) => p.kind === "cutout").slice(0, 1);
          if (!pieces.length) note = res.note ?? "Couldn't cut this one out cleanly; keeping the photo.";
        }
        patchJob(job.key, { stage: pieces.length ? "ready" : "error", frac: 1, pieces, source: res.source, note, error: pieces.length ? undefined : note });
      } catch (e) {
        patchJob(job.key, { stage: "error", error: e instanceof Error ? e.message : "Couldn't process this photo" });
      }
    });
  }

  function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.size);
    if (!list.length) return;
    if (WARDROBE_CAP - items.length <= 0) return setBanner(`Your wardrobe is full (${WARDROBE_CAP} items). Remove a few to add more.`);
    if (!aiReady) {
      setBanner("AI isn't switched on, so photos are saved as they are.");
    }
    warmCutter();
    const fresh: Job[] = list.slice(0, 30).map((file, idx) => ({
      key: `${Date.now()}-${idx}`,
      mode: "new",
      name: file.name,
      preview: URL.createObjectURL(file),
      stage: "queued",
      frac: 0,
      pieces: [],
    }));
    if (list.length > 30) setBanner("Added the first 30 photos. Add the rest after saving these.");
    setJobs((js) => [...js, ...fresh]);
    fresh.forEach((j, i) => enqueue(j, async () => list[i]));
  }

  const legacy = items.filter((i) => i.image_kind !== "cutout" && i.image_path);
  function cleanUp() {
    const busy = new Set(jobs.map((j) => j.itemId).filter(Boolean));
    const todo = legacy.filter((i) => !busy.has(i.id)).slice(0, CLEANUP_BATCH);
    if (!todo.length) return;
    warmCutter();
    const fresh: Job[] = todo.map((it) => ({
      key: `c-${it.id}`,
      mode: "cleanup",
      name: it.name ?? "Wardrobe item",
      preview: it.thumb_url ?? it.image_url ?? "",
      stage: "queued",
      frac: 0,
      pieces: [],
      itemId: it.id,
    }));
    setJobs((js) => [...js, ...fresh]);
    todo.forEach((it, k) =>
      enqueue(
        fresh[k],
        async () => {
          const { data } = await supabase.storage.from(BUCKET).download(it.image_path!);
          if (!data) throw new Error("Couldn't load the photo");
          return data;
        },
        { name: it.name, category: it.category }
      )
    );
    if (legacy.length > todo.length) setBanner(`Cleaning up ${todo.length} of ${legacy.length}. Run it again for the rest.`);
  }

  function togglePiece(job: string, piece: string) {
    patchJob(job, (j) => ({ pieces: j.pieces.map((p) => (p.key === piece ? { ...p, selected: !p.selected } : p)) }));
  }

  function dropJobs(keys: string[]) {
    setJobs((js) => {
      js.filter((j) => keys.includes(j.key)).forEach((j) => {
        if (j.preview.startsWith("blob:")) URL.revokeObjectURL(j.preview);
        j.pieces.forEach((p) => URL.revokeObjectURL(p.preview));
      });
      return js.filter((j) => !keys.includes(j.key));
    });
  }

  async function upload(path: string, blob: Blob) {
    const r = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/webp", upsert: false });
    if (r.error) throw new Error(r.error.message);
  }

  async function saveReviewed() {
    const ready = jobs.filter((j) => j.stage === "ready");
    if (!ready.length) return;
    setSaving(true);
    const created: WardrobeItem[] = [];
    const untagged: string[] = [];
    const done: string[] = [];
    let room = WARDROBE_CAP - items.length;
    let skipped = 0;
    let failed = 0;
    for (const j of ready) {
      const chosen = j.pieces.filter((p) => p.selected);
      try {
        if (j.mode === "cleanup") {
          const it = items.find((i) => i.id === j.itemId);
          const p = chosen[0];
          if (it && p) {
            const id = crypto.randomUUID();
            const path = `${userId}/${id}.${p.ext}`;
            const tpath = `${userId}/${id}_t.${p.ext}`;
            await upload(path, p.main);
            await upload(tpath, p.thumb);
            const tags = it.tag_status === "done" || it.tag_status === "manual" || !p.tags ? {} : tagPatch(p);
            const patch = { image_path: path, thumb_path: tpath, source_path: it.source_path ?? it.image_path, image_kind: "cutout" as const, ...tags };
            const { error } = await supabase.from("om_wardrobe_items").update(patch).eq("id", it.id);
            if (error) {
              await supabase.storage.from(BUCKET).remove([path, tpath]);
              throw new Error(error.message);
            }
            // Old full photo is kept as the original; its thumbnail is no longer needed.
            if (it.thumb_path && it.thumb_path !== it.image_path) await supabase.storage.from(BUCKET).remove([it.thumb_path]);
            const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls([path, tpath], 3600);
            setItems((s) => s.map((x) => (x.id === it.id ? { ...x, ...patch, image_url: signed?.[0]?.signedUrl, thumb_url: signed?.[1]?.signedUrl } : x)));
          }
        } else if (chosen.length) {
          const take = chosen.slice(0, Math.max(0, room));
          skipped += chosen.length - take.length;
          if (take.length) {
            // The original photo is stored once and shared by every piece cut from it.
            let source: string | null = null;
            if (j.source && take.some((p) => p.kind !== "photo")) {
              source = `${userId}/${crypto.randomUUID()}_src.${j.source.ext}`;
              await upload(source, j.source.main);
            }
            for (const p of take) {
              const id = crypto.randomUUID();
              const path = `${userId}/${id}.${p.ext}`;
              const tpath = `${userId}/${id}_t.${p.ext}`;
              await upload(path, p.main);
              await upload(tpath, p.thumb);
              const row = {
                id,
                user_id: userId,
                image_path: path,
                thumb_path: tpath,
                source_path: p.kind === "photo" ? null : source,
                image_kind: p.kind === "cutout" ? "cutout" : "photo",
                ...(p.tags ? tagPatch(p) : { name: j.name.replace(/\.[^.]+$/, "").slice(0, 60), tag_status: aiReady ? "pending" : "manual" }),
              };
              const { data, error } = await supabase.from("om_wardrobe_items").insert(row).select("*").single();
              if (error) {
                await supabase.storage.from(BUCKET).remove([path, tpath]);
                throw new Error(error.message.includes("wardrobe_full") ? "Wardrobe is full" : error.message);
              }
              const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls([path, tpath], 3600);
              created.push({ ...(data as WardrobeItem), image_url: signed?.[0]?.signedUrl, thumb_url: signed?.[1]?.signedUrl });
              if (!p.tags && aiReady) untagged.push(id);
              room--;
            }
          }
        }
        done.push(j.key);
      } catch (e) {
        failed++;
        patchJob(j.key, { error: e instanceof Error ? e.message : "Save failed" });
      }
    }
    if (created.length) setItems((s) => [...created.reverse(), ...s]);
    dropJobs(done);
    setSaving(false);
    if (skipped) setBanner(`Your wardrobe is full (${WARDROBE_CAP} items), so ${skipped} piece${skipped === 1 ? " wasn't" : "s weren't"} saved.`);
    else if (failed) setBanner("Some pieces couldn't be saved. Check your connection and try again.");
    if (untagged.length) await tag(untagged);
  }

  async function remove(item: WardrobeItem) {
    setItems((s) => s.filter((i) => i.id !== item.id));
    setEditing(null);
    await supabase.from("om_wardrobe_items").delete().eq("id", item.id);
    const paths = [item.image_path, item.thumb_path].filter(Boolean) as string[];
    // The original photo can be shared by several pieces: delete it only with the last one.
    if (item.source_path) {
      const { count } = await supabase.from("om_wardrobe_items").select("id", { count: "exact", head: true }).eq("source_path", item.source_path);
      if (!count) paths.push(item.source_path);
    }
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
            <m.div className={`h-full w-full origin-left rounded-full ${pct > 90 ? "bg-coral-deep" : "bg-blue"}`} initial={{ scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.8 }} />
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
          <span className="block text-sm text-muted">One item or a whole outfit per photo: we find each piece and cut it out onto white. Up to 10 MB each; location data is stripped.</span>
        </span>
        <span className="rounded-full bg-coral text-blue-ink font-semibold px-6 h-11 inline-flex items-center">Choose photos</span>
        <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onClick={() => warmCutter()} onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
      </label>

      {jobs.length > 0 && (
        <PieceReview
          jobs={jobs}
          model={model}
          saving={saving}
          onToggle={togglePiece}
          onDismissJob={(k) => dropJobs([k])}
          onDiscard={() => dropJobs(jobs.filter((j) => j.stage === "ready" || j.stage === "error").map((j) => j.key))}
          onSave={saveReviewed}
        />
      )}

      {/* Filters */}
      {items.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-3 justify-between">
          <PromptChips
            size="sm"
            chips={[{ id: "all", label: `All ${items.length}` }, ...Object.keys(CAT_LABEL).filter((c) => counts[c]).map((c) => ({ id: c, label: `${CAT_LABEL[c]} ${counts[c]}` })), ...(counts.untagged ? [{ id: "untagged", label: `Untagged ${counts.untagged}` }] : [])]}
            value={[filter]}
            onChange={(v) => setFilter(v[0] ?? "all")}
          />
          <div className="flex flex-wrap items-center gap-4">
            {failed.length > 0 && aiReady && (
              <button onClick={() => tag(failed)} className="nav-label text-blue inline-flex items-center gap-1.5 hover:text-coral-deep"><RefreshCw size={14} /> Retry tagging {failed.length}</button>
            )}
            {legacy.length > 0 && aiReady && (
              <button onClick={cleanUp} className="nav-label text-blue inline-flex items-center gap-1.5 h-11 hover:text-coral-deep"><Wand2 size={14} /> Clean up photos {legacy.length}</button>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {items.length === 0 && jobs.length === 0 ? (
        <div className="mt-14 text-center max-w-md mx-auto">
          <p className="display-condensed text-blue text-4xl">Empty closet, for now</p>
          <p className="mt-3 text-muted">Start with ten pieces you wear most: two tops, two bottoms, shoes, a watch or earrings, a bag. You can still get general outfit ideas meanwhile.</p>
          <Link href="/style" className="mt-5 inline-flex nav-label text-blue hover:text-coral-deep">Get a general outfit idea →</Link>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <AnimatePresence initial={false}>
            {shown.map((item) => (
              <m.li key={item.id} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
                <button onClick={() => setEditing(item)} className="group block w-full text-left transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.97] touch-manipulation">
                  <div className={`relative aspect-[4/5] overflow-hidden rounded-2xl border border-blue/10 ${item.image_kind === "cutout" ? "bg-white" : "bg-paper"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {item.thumb_url && <img src={item.thumb_url} alt={item.name ?? "Wardrobe item"} loading="lazy" decoding="async" width={300} height={375} className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]" />}
                    {item.tag_status === "pending" && (
                      <div className="absolute inset-x-0 bottom-0 bg-ivory/95 px-3 py-2 flex items-center gap-2 text-xs text-blue"><Sparkles size={12} /> Tagging<BounceDots className="bg-blue scale-50" /></div>
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
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {hasMore && (
        <div ref={sentinel} className="mt-6 flex justify-center">
          <button onClick={() => setLimit((l) => l + PAGE)} className="h-11 px-5 rounded-full border border-blue/25 text-sm font-medium text-blue active:scale-95 transition-transform">Show more ({filtered.length - limit})</button>
        </div>
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
  // The grid only signs thumbnails; fetch the full-size photo when the sheet opens.
  const [full, setFull] = useState<string | null>(item.image_url ?? null);
  const [orig, setOrig] = useState<string | null>(null);
  const [showOrig, setShowOrig] = useState(false);
  useEffect(() => {
    if (!showOrig || orig || !item.source_path) return;
    let live = true;
    createClient().storage.from(BUCKET).createSignedUrl(item.source_path, 3600).then(({ data }) => live && data && setOrig(data.signedUrl));
    return () => { live = false; };
  }, [showOrig, orig, item.source_path]);
  useEffect(() => {
    if (full || !item.image_path) return;
    let live = true;
    createClient().storage.from(BUCKET).createSignedUrl(item.image_path, 3600).then(({ data }) => live && data && setFull(data.signedUrl));
    return () => { live = false; };
  }, [item.image_path, full]);
  const set = <K extends keyof WardrobeItem>(k: K, v: WardrobeItem[K]) => setD((s) => ({ ...s, [k]: v }));
  const list = (s: string) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 6);
  return (
    <>
      <m.div className="fixed inset-0 z-40 bg-blue-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <m.aside
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
        {(full || item.thumb_url) && <img decoding="async" src={(showOrig && orig) || full || item.thumb_url || ""} alt="" className={`mt-4 w-full max-h-72 object-contain rounded-2xl ${item.image_kind === "cutout" && !showOrig ? "bg-white" : "bg-paper"}`} />}
        {item.source_path && (
          <button onClick={() => setShowOrig((v) => !v)} className="mt-2 nav-label text-blue h-9 px-1 hover:text-coral-deep">{showOrig ? "Show cutout" : "View original photo"}</button>
        )}
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
      </m.aside>
    </>
  );
}
