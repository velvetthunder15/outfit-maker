"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, m } from "motion/react";
import { ImagePlus, Trash2, X, RefreshCw, Sparkles, AlertCircle, Wand2, MoreHorizontal, Check, Scissors, Crop, Image as ImageIcon, PencilLine, ScanSearch, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { processPhoto, recutPiece, warmCutter, resetCutter, type Detected, type RecutMode } from "@/lib/cutout/client";
import type { Box } from "@/lib/cutout/core";
import { PieceReview, type Job, type ReviewPiece, type Busy } from "./piece-review";
import { BUCKET, WARDROBE_CAP } from "@/lib/storage";
import type { WardrobeItem } from "@/lib/types";
import { colorHex } from "@/lib/options";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { BounceDots } from "@/components/amicro/bounce-dots";
import { PromptChips } from "@/components/amicro/prompt-chips";
import { ActionSheet, type SheetAction } from "@/components/wardrobe/action-sheet";
import { ModifySheet, type ModifyResult, type TagDraft } from "@/components/wardrobe/modify-sheet";
import { UndoToast, useUndoToast } from "@/components/wardrobe/undo-toast";

const CLEANUP_BATCH = 20;
const PAGE = 24;
const SIDE_CAP_MS = 240_000;

/** Row fields from detected / edited tags. */
function tagPatch(t: Detected) {
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

const EMPTY_DRAFT: TagDraft = { name: "", category: null, subcategory: null, colors: [], pattern: null, fabric: null, formality: null, seasons: [], styles: [] };
const draftOf = (t: Detected | null): TagDraft => (t ? { name: t.name ?? "", category: t.category || null, subcategory: t.subcategory, colors: t.colors ?? [], pattern: t.pattern, fabric: t.fabric, formality: t.formality, seasons: t.seasons ?? [], styles: t.styles ?? [] } : { ...EMPTY_DRAFT });
const fromDraft = (d: TagDraft, prev: Detected | null, boxes: Box[] | null): Detected | null => {
  const name = d.name.trim();
  if (!name && !d.category && !prev) return null;
  return { name: name || prev?.name || "", category: d.category ?? "", subcategory: d.subcategory, colors: d.colors, pattern: d.pattern, fabric: d.fabric, formality: d.formality, seasons: d.seasons, styles: d.styles, worn: prev?.worn ?? false, boxes: boxes ?? prev?.boxes ?? [] };
};
const unionBox = (boxes: Box[] | null): Box | null => {
  if (!boxes?.length) return null;
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
};

const REDO_LABEL: Record<RecutMode, string> = { cutout: "Cutting out", crop: "Cropping", photo: "Using whole photo" };

const CAT_LABEL: Record<string, string> = {
  top: "Tops", bottom: "Bottoms", dress: "Dresses & sets", outerwear: "Layers", shoes: "Shoes", jewellery: "Jewellery", watch: "Watches",
  bag: "Bags", belt: "Belts", eyewear: "Eyewear", hat: "Hats", scarf: "Scarves & dupattas", other: "Other",
};

type Menu = { kind: "piece"; job: string; piece: string } | { kind: "item"; id: string } | null;
type Sheet = { kind: "piece"; job: string; piece: string; photo: string } | { kind: "add"; job: string; photo: string } | { kind: "item"; id: string; startOn?: "details" | "crop" } | null;

const strip = (i: WardrobeItem) => {
  const { image_url: _a, thumb_url: _b, ...row } = i;
  void _a;
  void _b;
  return row;
};
const nameOf = (s: string | null | undefined, fallback = "item") => (s && s.trim() ? `“${s.trim().slice(0, 28)}”` : fallback);

export function WardrobeClient({ userId, initialItems, welcome, aiReady }: { userId: string; initialItems: WardrobeItem[]; welcome: boolean; aiReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<WardrobeItem[]>(initialItems);
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef(jobs);
  const itemsRef = useRef(items);
  useEffect(() => void (jobsRef.current = jobs), [jobs]);
  useEffect(() => void (itemsRef.current = items), [items]);
  const [model, setModel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Single-piece redos (review pieces and saved items) run one at a time, next to the photo queue.
  const side = useRef<Promise<void>>(Promise.resolve());
  const retryable = useRef(new Map<string, { input: () => Promise<File | Blob>; hint?: { name?: string | null; category?: string | null } }>());
  const [filter, setFilter] = useState<string>("all");
  const [menu, setMenu] = useState<Menu>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busyItems, setBusyItems] = useState<Record<string, Busy>>({});
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(aiReady ? null : "AI tagging isn't switched on yet. Photos still save; you can tag items by hand.");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useUndoToast();

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

  const patchJob = useCallback(
    (key: string, patch: Partial<Job> | ((j: Job) => Partial<Job>)) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...(typeof patch === "function" ? patch(j) : patch) } : j))),
    []
  );
  const patchPiece = useCallback(
    (job: string, piece: string, patch: Partial<ReviewPiece>) => patchJob(job, (j) => ({ pieces: j.pieces.map((p) => (p.key === piece ? { ...p, ...patch } : p)) })),
    [patchJob]
  );
  const setBusy = (id: string, b?: Busy) =>
    setBusyItems((s) => {
      const n = { ...s };
      if (b) n[id] = b;
      else delete n[id];
      return n;
    });

  /** Run one single-piece task after the previous one; a hard cap keeps one bad task from blocking the rest. */
  function onSide(task: () => Promise<void>) {
    side.current = side.current.then(async () => {
      let hard: ReturnType<typeof setTimeout> | null = null;
      try {
        await Promise.race([
          task(),
          new Promise<void>((_, rej) => {
            hard = setTimeout(() => {
              resetCutter();
              rej(new Error("stuck"));
            }, SIDE_CAP_MS);
          }),
        ]);
      } catch {
        /* each task reports its own failure */
      } finally {
        if (hard) clearTimeout(hard);
      }
    });
  }

  /** Photos are processed one at a time (memory on phones); detection + embedding overlap inside each. */
  function enqueue(job: Job, input: () => Promise<File | Blob>, hint?: { name?: string | null; category?: string | null }) {
    retryable.current.set(job.key, { input, hint });
    queue.current = queue.current.then(async () => {
      let live = true;
      let hard: ReturnType<typeof setTimeout> | null = null;
      try {
        // processPhoto has its own stall watchdog; this hard cap is the last line of defence so one
        // photo can never hold up the rest of the queue.
        const capped = new Promise<never>((_, rej) => {
          hard = setTimeout(() => {
            resetCutter();
            rej(new Error("This photo got stuck. Tap Detect again."));
          }, 240_000);
        });
        const res = await Promise.race([
          (async () =>
            processPhoto(await input(), {
              hint,
              onStage: (stage, frac) => live && patchJob(job.key, { stage, frac }),
              onModel: (f) => live && setModel(f),
            }))(),
          capped,
        ]);
        let pieces: ReviewPiece[] = res.pieces;
        let note = res.note;
        if (job.mode === "cleanup") {
          // Only a real cutout replaces an existing photo.
          pieces = pieces.filter((p) => p.kind === "cutout").slice(0, 1);
          if (!pieces.length) note = res.note ?? "Couldn't cut this one out cleanly; keeping the photo.";
        }
        patchJob(job.key, { stage: pieces.length ? "ready" : "error", frac: 1, pieces, source: res.source, note, error: pieces.length ? undefined : note });
      } catch (e) {
        patchJob(job.key, { stage: "error", error: e instanceof Error ? e.message : "Couldn't process this photo" });
      } finally {
        live = false;
        if (hard) clearTimeout(hard);
      }
    });
  }

  /** "Detect again": re-run detection + cutouts for the whole photo (replaces its pieces). */
  function retryJob(key: string) {
    const r = retryable.current.get(key);
    const j = jobsRef.current.find((x) => x.key === key);
    if (!r || !j) return;
    j.pieces.forEach((p) => URL.revokeObjectURL(p.preview));
    patchJob(key, { stage: "queued", frac: 0, pieces: [], note: undefined, error: undefined, source: undefined });
    enqueue({ ...j, stage: "queued" }, r.input, r.hint);
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

  async function download(path: string) {
    const { data } = await supabase.storage.from(BUCKET).download(path);
    if (!data) throw new Error("Couldn't load the photo. Check your connection.");
    return data;
  }

  const legacy = items.filter((i) => i.image_kind !== "cutout" && i.image_path);
  /** Re-cut existing items onto white (from their original photo when there is one). */
  function cleanUp(list: WardrobeItem[]) {
    const busy = new Set(jobsRef.current.map((j) => j.itemId).filter(Boolean));
    const all = list.filter((i) => (i.source_path || i.image_path) && !busy.has(i.id));
    const todo = all.slice(0, CLEANUP_BATCH);
    if (!todo.length) return;
    warmCutter();
    const fresh: Job[] = todo.map((it) => ({
      key: `c-${it.id}-${Date.now()}`,
      mode: "cleanup",
      name: it.name ?? "Wardrobe item",
      preview: it.thumb_url ?? it.image_url ?? "",
      stage: "queued",
      frac: 0,
      pieces: [],
      itemId: it.id,
    }));
    setJobs((js) => [...js, ...fresh]);
    todo.forEach((it, k) => enqueue(fresh[k], () => download((it.source_path ?? it.image_path)!), { name: it.name, category: it.category }));
    if (all.length > todo.length) setBanner(`Cleaning up ${todo.length} of ${all.length}. Run it again for the rest.`);
    window.requestAnimationFrame(() => document.getElementById("review")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  }

  // ---------------- review: per-piece controls ----------------
  function togglePiece(job: string, piece: string) {
    patchJob(job, (j) => ({ pieces: j.pieces.map((p) => (p.key === piece ? { ...p, selected: !p.selected } : p)) }));
  }

  function deletePiece(jobKey: string, pieceKey: string) {
    const j = jobsRef.current.find((x) => x.key === jobKey);
    const idx = j?.pieces.findIndex((p) => p.key === pieceKey) ?? -1;
    if (!j || idx < 0) return;
    const p = j.pieces[idx];
    patchJob(jobKey, (x) => ({ pieces: x.pieces.filter((q) => q.key !== pieceKey) }));
    toast.show(`Removed ${nameOf(p.tags?.name, "piece")}`, {
      undo: () =>
        patchJob(jobKey, (x) => {
          if (x.pieces.some((q) => q.key === pieceKey)) return {};
          const arr = [...x.pieces];
          arr.splice(Math.min(idx, arr.length), 0, p);
          return { pieces: arr };
        }),
      commit: () => {
        // Free the blob only if the piece really is gone (not restored by Undo).
        if (!jobsRef.current.some((x) => x.pieces.some((q) => q.key === pieceKey))) URL.revokeObjectURL(p.preview);
      },
    });
  }

  /** Re-make one piece (cut out again / plain crop / whole photo), optionally with a new box. */
  function redoPiece(jobKey: string, pieceKey: string, mode: RecutMode, boxes?: Box[] | null, opts: { added?: boolean } = {}) {
    const r = retryable.current.get(jobKey);
    const p = jobsRef.current.find((x) => x.key === jobKey)?.pieces.find((q) => q.key === pieceKey);
    if (!r || !p) return;
    const useBoxes = boxes !== undefined ? boxes : p.boxes;
    patchPiece(jobKey, pieceKey, { busy: { label: REDO_LABEL[mode], frac: 0.03 }, ...(boxes !== undefined && boxes ? { boxes } : {}) });
    onSide(async () => {
      try {
        const input = await r.input();
        const res = await recutPiece(input, useBoxes ?? null, mode, {
          onStage: (_s, f) => patchPiece(jobKey, pieceKey, { busy: { label: REDO_LABEL[mode], frac: f } }),
          onModel: setModel,
          category: p.tags?.category,
        });
        const alive = jobsRef.current.find((x) => x.key === jobKey)?.pieces.find((q) => q.key === pieceKey);
        if (!alive) return; // removed meanwhile
        const preview = URL.createObjectURL(res.thumb);
        const nb = res.boxes ?? useBoxes ?? null;
        patchPiece(jobKey, pieceKey, {
          main: res.main,
          thumb: res.thumb,
          ext: res.ext,
          kind: res.kind,
          low: res.low,
          boxes: nb,
          tags: alive.tags && nb ? { ...alive.tags, boxes: nb } : alive.tags,
          preview,
          busy: undefined,
          selected: true,
        });
        URL.revokeObjectURL(alive.preview);
        toast.show(res.note ?? (opts.added ? "Piece added" : mode === "cutout" ? "Cut out again" : mode === "crop" ? "Cropped on white" : "Using the whole photo"));
      } catch (e) {
        if (opts.added) {
          const gone = jobsRef.current.find((x) => x.key === jobKey)?.pieces.find((q) => q.key === pieceKey);
          if (gone) URL.revokeObjectURL(gone.preview);
          patchJob(jobKey, (x) => ({ pieces: x.pieces.filter((q) => q.key !== pieceKey) }));
          toast.show("Couldn't add that piece. Try drawing the box again.");
        } else {
          patchPiece(jobKey, pieceKey, { busy: undefined });
          toast.show(e instanceof Error && e.message.length < 90 ? e.message : "Couldn't redo this piece, so it's unchanged.");
        }
        throw e;
      }
    });
  }

  function openPieceSheet(jobKey: string, pieceKey?: string) {
    const j = jobsRef.current.find((x) => x.key === jobKey);
    if (!j) return;
    // The editor shows the same photo the boxes were measured on (decoded + oriented, 1024 px).
    const photo = j.source ? URL.createObjectURL(j.source.main) : j.preview;
    setSheet(pieceKey ? { kind: "piece", job: jobKey, piece: pieceKey, photo } : { kind: "add", job: jobKey, photo });
  }
  function closeSheet() {
    setSheet((s) => {
      if (s && "photo" in s && s.photo.startsWith("blob:") && !jobsRef.current.some((j) => j.preview === s.photo)) URL.revokeObjectURL(s.photo);
      return null;
    });
  }

  function applyPiece(jobKey: string, pieceKey: string, r: ModifyResult) {
    const p = jobsRef.current.find((x) => x.key === jobKey)?.pieces.find((q) => q.key === pieceKey);
    if (!p) return closeSheet();
    const boxes = r.boxChanged && r.box ? [r.box] : p.boxes;
    patchPiece(jobKey, pieceKey, { tags: fromDraft(r.tags, p.tags, boxes) });
    closeSheet();
    if (r.boxChanged && r.box) redoPiece(jobKey, pieceKey, r.cut, [r.box]);
    else toast.show("Changes saved");
  }

  function addPiece(jobKey: string, r: ModifyResult) {
    const j = jobsRef.current.find((x) => x.key === jobKey);
    closeSheet();
    if (!j?.source || !r.box) return;
    const key = crypto.randomUUID();
    const piece: ReviewPiece = {
      key,
      tags: fromDraft(r.tags, null, [r.box]),
      main: j.source.main,
      thumb: j.source.main,
      ext: j.source.ext,
      preview: URL.createObjectURL(j.source.main),
      kind: "crop",
      selected: false,
      boxes: [r.box],
      added: true,
      busy: { label: REDO_LABEL[r.cut], frac: 0.03 },
    };
    patchJob(jobKey, (x) => ({ pieces: [...x.pieces, piece] }));
    // Wait for the state to land so redoPiece can find the placeholder.
    window.setTimeout(() => redoPiece(jobKey, key, r.cut, [r.box!], { added: true }), 0);
  }

  function dropJobs(keys: string[]) {
    setJobs((js) => {
      js.filter((j) => keys.includes(j.key)).forEach((j) => {
        if (j.preview.startsWith("blob:")) URL.revokeObjectURL(j.preview);
        retryable.current.delete(j.key);
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
    const ready = jobsRef.current.filter((j) => j.stage === "ready");
    if (!ready.length) return;
    setSaving(true);
    toast.dismiss();
    const created: WardrobeItem[] = [];
    const untagged: string[] = [];
    const done: string[] = [];
    let room = WARDROBE_CAP - itemsRef.current.length;
    let skipped = 0;
    let failed = 0;
    for (const j of ready) {
      const chosen = j.pieces.filter((p) => p.selected && !p.busy);
      try {
        if (j.mode === "cleanup") {
          const it = itemsRef.current.find((i) => i.id === j.itemId);
          const p = chosen[0];
          if (it && p) {
            const id = crypto.randomUUID();
            const path = `${userId}/${id}.${p.ext}`;
            const tpath = `${userId}/${id}_t.${p.ext}`;
            await upload(path, p.main);
            await upload(tpath, p.thumb);
            const tags = it.tag_status === "done" || it.tag_status === "manual" || !p.tags?.category ? {} : tagPatch(p.tags);
            const source = it.source_path ?? it.image_path;
            const patch = { image_path: path, thumb_path: tpath, source_path: source, image_kind: p.kind === "cutout" ? ("cutout" as const) : ("photo" as const), ...tags };
            const { error } = await supabase.from("om_wardrobe_items").update(patch).eq("id", it.id);
            if (error) {
              await supabase.storage.from(BUCKET).remove([path, tpath]);
              throw new Error(error.message);
            }
            // The original photo is kept; the old image (if it wasn't the original) and thumbnail go.
            const old = [it.thumb_path, it.image_path].filter((x): x is string => Boolean(x) && x !== source);
            if (old.length) await supabase.storage.from(BUCKET).remove(old);
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
              const tagged = Boolean(p.tags?.category);
              const row = {
                id,
                user_id: userId,
                image_path: path,
                thumb_path: tpath,
                source_path: p.kind === "photo" ? null : source,
                image_kind: p.kind === "cutout" ? "cutout" : "photo",
                ...(tagged ? tagPatch(p.tags!) : { name: (p.tags?.name || j.name.replace(/\.[^.]+$/, "")).slice(0, 60), tag_status: aiReady ? "pending" : "manual" }),
              };
              const { data, error } = await supabase.from("om_wardrobe_items").insert(row).select("*").single();
              if (error) {
                await supabase.storage.from(BUCKET).remove([path, tpath]);
                throw new Error(error.message.includes("wardrobe_full") ? "Wardrobe is full" : error.message);
              }
              const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls([path, tpath], 3600);
              created.push({ ...(data as WardrobeItem), image_url: signed?.[0]?.signedUrl, thumb_url: signed?.[1]?.signedUrl });
              if (!tagged && aiReady) untagged.push(id);
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
    else if (created.length) toast.show(`Saved ${created.length} piece${created.length === 1 ? "" : "s"}`);
    if (untagged.length) await tag(untagged);
  }

  // ---------------- saved items ----------------
  /** Delete now; the photo files go when the Undo toast expires (Undo puts the rows back). */
  function removeItems(list: WardrobeItem[]) {
    if (!list.length) return;
    const ids = list.map((i) => i.id);
    setItems((s) => s.filter((i) => !ids.includes(i.id)));
    setSheet(null);
    setSel(new Set());
    const del = supabase.from("om_wardrobe_items").delete().in("id", ids).then((r) => r);
    toast.show(list.length === 1 ? `Deleted ${nameOf(list[0].name)}` : `Deleted ${list.length} items`, {
      undo: async () => {
        await del;
        const { error } = await supabase.from("om_wardrobe_items").insert(list.map(strip));
        if (error) return toast.show("Couldn't bring it back. Check your connection.");
        setItems((s) => [...s.filter((i) => !ids.includes(i.id)), ...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")));
      },
      commit: async () => {
        const r = await del;
        if (r.error) return;
        const paths = list.flatMap((i) => [i.image_path, i.thumb_path]).filter((x): x is string => Boolean(x));
        // An original photo can be shared by several pieces: delete it only with the last one.
        for (const src of Array.from(new Set(list.map((i) => i.source_path).filter((x): x is string => Boolean(x))))) {
          const { count } = await supabase.from("om_wardrobe_items").select("id", { count: "exact", head: true }).eq("source_path", src);
          if (!count) paths.push(src);
        }
        if (paths.length) await supabase.storage.from(BUCKET).remove(Array.from(new Set(paths)));
      },
    });
  }

  /** Swap an item's picture for a new one; the old files go when the Undo toast expires. */
  async function replaceImage(it: WardrobeItem, res: { main: Blob; thumb: Blob; ext: string; kind: "cutout" | "crop" | "photo" }, tags: Detected | null, msg: string) {
    const id = crypto.randomUUID();
    const path = `${userId}/${id}.${res.ext}`;
    const tpath = `${userId}/${id}_t.${res.ext}`;
    await upload(path, res.main);
    await upload(tpath, res.thumb);
    const source = it.source_path ?? it.image_path;
    const fill = tags?.category && !(it.tag_status === "done" || it.tag_status === "manual") ? tagPatch(tags) : {};
    const patch = { image_path: path, thumb_path: tpath, source_path: source, image_kind: res.kind === "cutout" ? ("cutout" as const) : ("photo" as const), ...fill };
    const { error } = await supabase.from("om_wardrobe_items").update(patch).eq("id", it.id);
    if (error) {
      await supabase.storage.from(BUCKET).remove([path, tpath]);
      throw new Error("Couldn't save the new picture. Check your connection.");
    }
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls([path, tpath], 3600);
    setItems((s) => s.map((x) => (x.id === it.id ? { ...x, ...patch, image_url: signed?.[0]?.signedUrl, thumb_url: signed?.[1]?.signedUrl } : x)));
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (it as Record<string, unknown>)[k] ?? null]));
    if (!("image_kind" in it) || !it.image_kind) before.image_kind = "photo";
    toast.show(msg, {
      undo: async () => {
        setItems((s) => s.map((x) => (x.id === it.id ? { ...x, ...before, image_url: it.image_url, thumb_url: it.thumb_url } : x)));
        await supabase.from("om_wardrobe_items").update(before).eq("id", it.id);
        await supabase.storage.from(BUCKET).remove([path, tpath]);
      },
      commit: async () => {
        const old = Array.from(new Set([it.thumb_path, it.image_path])).filter((x): x is string => Boolean(x) && x !== source);
        if (old.length) await supabase.storage.from(BUCKET).remove(old);
      },
    });
  }

  /** Retry for a saved item: find it again in the original photo (or use the given box) and re-cut. */
  function redoItem(item: WardrobeItem, mode: RecutMode, box?: Box | null) {
    if (busyItems[item.id]) return;
    if (mode !== "photo" && !box && !aiReady) return setSheet({ kind: "item", id: item.id, startOn: "crop" });
    setBusy(item.id, { label: REDO_LABEL[mode], frac: 0.03 });
    onSide(async () => {
      try {
        const it = itemsRef.current.find((x) => x.id === item.id);
        if (!it) return;
        const path = it.source_path ?? it.image_path;
        if (!path) throw new Error("This item has no photo to work from.");
        const input = await download(path);
        const onStage = (_s: string, f: number) => setBusy(it.id, { label: REDO_LABEL[mode], frac: f });
        if (mode === "photo" || box) {
          const r = await recutPiece(input, box ? [box] : null, mode, { onStage, onModel: setModel, category: it.category });
          await replaceImage(it, r, null, r.note ?? (mode === "photo" ? `Using the whole photo for ${nameOf(it.name)}` : `Re-cut ${nameOf(it.name)}`));
        } else {
          const r = await processPhoto(input, { mode, hint: { name: it.name, category: it.category }, onStage, onModel: setModel });
          r.pieces.forEach((p) => URL.revokeObjectURL(p.preview));
          const pc = r.pieces.find((p) => p.kind !== "photo");
          if (!pc) throw new Error("Couldn't find it in the photo. Tap Edit › Crop to draw a box around it.");
          const note = mode === "cutout" && pc.kind !== "cutout" ? "Couldn't cut it out cleanly, so it's cropped instead." : mode === "cutout" ? `Cut out ${nameOf(it.name)} again` : `Cropped ${nameOf(it.name)} on white`;
          await replaceImage(it, pc, pc.tags, note);
        }
      } catch (e) {
        toast.show(e instanceof Error && e.message.length < 90 ? e.message : "Couldn't redo it, so it's unchanged.");
        throw e;
      } finally {
        setBusy(item.id);
      }
    });
  }

  async function saveTags(item: WardrobeItem, d: TagDraft) {
    const patch = {
      name: d.name.trim() || item.name,
      category: (d.category as WardrobeItem["category"]) ?? null,
      subcategory: d.subcategory,
      colors: d.colors,
      pattern: d.pattern,
      fabric: d.fabric,
      formality: d.formality,
      seasons: d.seasons,
      styles: d.styles,
      notes: d.notes ?? null,
      tag_status: item.tag_status === "done" ? ("done" as const) : ("manual" as const),
    };
    setItems((s) => s.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("om_wardrobe_items").update(patch).eq("id", item.id);
    if (error) toast.show("Couldn't save changes. Check your connection.");
  }

  const toggleSel = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const exitSelect = () => {
    setSelecting(false);
    setSel(new Set());
  };

  // ---------------- menus ----------------
  const menuPiece = menu?.kind === "piece" ? jobsRef.current.find((j) => j.key === menu.job)?.pieces.find((p) => p.key === menu.piece) : undefined;
  const menuJob = menu?.kind === "piece" ? jobs.find((j) => j.key === menu.job) : undefined;
  const menuItem = menu?.kind === "item" ? items.find((i) => i.id === menu.id) : undefined;
  const pieceActions: SheetAction[] = [
    { id: "cutout", label: "Cut out again", desc: menuPiece?.boxes ? "Same box, fresh cutout on white" : "Cut out the main thing in the photo", icon: Scissors },
    { id: "crop", label: "Plain crop", desc: "Crop the box onto white, no cutout", icon: Crop },
    { id: "photo", label: "Use whole photo", desc: "Keep the photo as it is", icon: ImageIcon },
    ...(menuJob?.mode === "new" ? [{ id: "detect", label: "Detect again", desc: "Find every piece in this photo again (replaces its pieces)", icon: ScanSearch }] : []),
  ];
  const itemActions: SheetAction[] = [
    { id: "edit", label: "Edit details & crop", desc: "Name, category, colours… or move the crop box", icon: PencilLine },
    { id: "cutout", label: "Cut out again", desc: aiReady ? "Find it in the original photo and cut it out" : "Draw a box, then cut it out", icon: Scissors },
    { id: "crop", label: "Plain crop", desc: aiReady ? "Find it in the original photo, crop on white" : "Draw a box, crop on white", icon: Crop },
    ...(menuItem?.source_path ? [{ id: "photo", label: "Use whole photo", desc: "Go back to the original photo", icon: ImageIcon }] : []),
    ...(aiReady ? [{ id: "retag", label: "Re-tag with AI", icon: Sparkles }] : []),
    { id: "delete", label: "Delete", desc: "You can undo for a few seconds", icon: Trash2, danger: true },
  ];

  function pickMenu(id: string) {
    const mm = menu;
    setMenu(null);
    if (!mm) return;
    if (mm.kind === "piece") {
      if (id === "detect") retryJob(mm.job);
      else redoPiece(mm.job, mm.piece, id as RecutMode);
      return;
    }
    const it = itemsRef.current.find((i) => i.id === mm.id);
    if (!it) return;
    if (id === "edit") setSheet({ kind: "item", id: it.id });
    else if (id === "delete") removeItems([it]);
    else if (id === "retag") tag([it.id]);
    else redoItem(it, id as RecutMode);
  }

  const pct = Math.round((items.length / WARDROBE_CAP) * 100);
  const failed = items.filter((i) => i.tag_status === "failed").map((i) => i.id);
  const sheetPiece = sheet?.kind === "piece" ? jobs.find((j) => j.key === sheet.job)?.pieces.find((p) => p.key === sheet.piece) : undefined;
  const sheetItem = sheet?.kind === "item" ? items.find((i) => i.id === sheet.id) : undefined;
  const selItems = items.filter((i) => sel.has(i.id));
  const signer = useMemo(() => {
    const it = sheetItem;
    if (!it) return null;
    const path = it.source_path ?? it.image_path;
    if (!path) return null;
    return async () => (await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? null;
  }, [sheetItem, supabase]);

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
        <div id="review" className="scroll-mt-20">
          <PieceReview
            jobs={jobs}
            model={model}
            saving={saving}
            onToggle={togglePiece}
            onDelete={deletePiece}
            onRetry={(job, piece) => setMenu({ kind: "piece", job, piece })}
            onModify={(job, piece) => openPieceSheet(job, piece)}
            onAdd={(job) => openPieceSheet(job)}
            onDetectAgain={retryJob}
            onDismissJob={(k) => dropJobs([k])}
            onDiscard={() => dropJobs(jobs.filter((j) => j.stage === "ready" || j.stage === "error").map((j) => j.key))}
            onSave={saveReviewed}
          />
        </div>
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {failed.length > 0 && aiReady && !selecting && (
              <button onClick={() => tag(failed)} className="nav-label text-blue inline-flex items-center gap-1.5 h-11 hover:text-coral-deep"><RefreshCw size={14} /> Retry tagging {failed.length}</button>
            )}
            {legacy.length > 0 && aiReady && !selecting && (
              <button onClick={() => cleanUp(legacy)} className="nav-label text-blue inline-flex items-center gap-1.5 h-11 hover:text-coral-deep"><Wand2 size={14} /> Clean up photos {legacy.length}</button>
            )}
            {selecting ? (
              <>
                <button onClick={() => setSel(sel.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id)))} className="nav-label text-blue inline-flex items-center gap-1.5 h-11 px-1 hover:text-coral-deep">
                  {sel.size === filtered.length && filtered.length ? "Select none" : `Select all ${filtered.length}`}
                </button>
                <button onClick={exitSelect} className="h-11 rounded-full bg-blue px-4 text-xs font-semibold text-ivory active:scale-95 transition-transform motion-reduce:transition-none">Done</button>
              </>
            ) : (
              <button onClick={() => setSelecting(true)} className="h-11 inline-flex items-center gap-1.5 rounded-full border border-blue/20 px-4 text-xs font-semibold text-blue active:scale-95 transition-transform motion-reduce:transition-none hover:bg-blue/[0.06]">
                <ListChecks size={15} /> Select
              </button>
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
            {shown.map((item) => {
              const busy = busyItems[item.id];
              const on = sel.has(item.id);
              return (
                <m.li key={item.id} className="relative" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
                  <button
                    onClick={() => (selecting ? toggleSel(item.id) : !busy && setSheet({ kind: "item", id: item.id }))}
                    aria-pressed={selecting ? on : undefined}
                    aria-label={selecting ? `${on ? "Deselect" : "Select"} ${item.name ?? "item"}` : `Edit ${item.name ?? "item"}`}
                    className="group block w-full text-left transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.97] motion-reduce:transition-none touch-manipulation"
                  >
                    <div className={`relative aspect-[4/5] overflow-hidden rounded-2xl border-2 transition-[border-color] duration-200 ${selecting && on ? "border-blue" : "border-blue/10"} ${item.image_kind === "cutout" ? "bg-white" : "bg-paper"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {item.thumb_url && <img src={item.thumb_url} alt={item.name ?? "Wardrobe item"} loading="lazy" decoding="async" width={300} height={375} className={`h-full w-full object-cover transition-[transform,opacity] duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04] ${busy ? "opacity-40" : ""}`} />}
                      {item.tag_status === "pending" && !busy && (
                        <div className="absolute inset-x-0 bottom-0 bg-ivory/95 px-3 py-2 flex items-center gap-2 text-xs text-blue"><Sparkles size={12} /> Tagging<BounceDots className="bg-blue scale-50" /></div>
                      )}
                      {item.tag_status === "failed" && !busy && <div className="absolute bottom-2 left-2 rounded-full bg-coral text-blue-ink text-[0.65rem] font-semibold px-2 py-0.5">Needs tags</div>}
                      {item.category && <span className="absolute top-2 left-2 rounded-full bg-ivory/90 text-blue nav-label !text-[0.6rem] px-2 py-1">{item.category}</span>}
                      {busy && (
                        <span className="absolute inset-x-2 bottom-2 rounded-lg bg-ivory/95 px-2 py-1.5 text-[0.65rem] font-medium text-blue" role="status">
                          <span className="block mb-1 truncate">{busy.label}</span>
                          <span className="relative block h-1 w-full rounded-full bg-blue/10 overflow-hidden">
                            <span className="absolute inset-0 origin-left rounded-full bg-coral transition-transform duration-500 ease-[var(--ease-out-expo)] motion-reduce:transition-none" style={{ transform: `scaleX(${Math.max(0.04, busy.frac)})` }} />
                          </span>
                        </span>
                      )}
                      {selecting && (
                        <span aria-hidden className={`absolute top-1.5 right-1.5 h-8 w-8 grid place-items-center rounded-full border-2 transition-[transform,background-color,border-color] duration-200 motion-reduce:transition-none ${on ? "bg-coral border-coral text-blue-ink scale-100" : "bg-white/95 border-blue/35 text-transparent scale-90"}`}>
                          <Check size={17} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-medium truncate pr-1">{item.name ?? "Untitled"}</p>
                    <div className="mt-1 flex gap-1 h-3">
                      {item.colors.slice(0, 4).map((c) => (
                        <span key={c} title={c} className="h-3 w-3 rounded-full border border-blue/20" style={{ background: colorHex(c) ?? c }} />
                      ))}
                    </div>
                  </button>
                  {!selecting && (
                    <button
                      onClick={() => setMenu({ kind: "item", id: item.id })}
                      disabled={Boolean(busy)}
                      aria-label={`More actions for ${item.name ?? "item"}`}
                      className="absolute top-0 right-0 h-12 w-12 grid place-items-center touch-manipulation disabled:opacity-40"
                    >
                      <span className="h-8 w-8 grid place-items-center rounded-full bg-ivory/95 text-blue border border-blue/15 shadow-[0_2px_8px_-2px_rgba(15,47,73,0.35)] transition-transform duration-150 active:scale-90 motion-reduce:transition-none">
                        <MoreHorizontal size={18} />
                      </span>
                    </button>
                  )}
                </m.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      {hasMore && (
        <div ref={sentinel} className="mt-6 flex justify-center">
          <button onClick={() => setLimit((l) => l + PAGE)} className="h-11 px-5 rounded-full border border-blue/25 text-sm font-medium text-blue active:scale-95 transition-transform">Show more ({filtered.length - limit})</button>
        </div>
      )}

      {items.length >= 2 && !selecting && (
        <div className="mt-10 flex justify-center">
          <Link href="/style"><MagneticButton variant="blue">Style me from my wardrobe</MagneticButton></Link>
        </div>
      )}
      {selecting && <div className="h-24" aria-hidden />}

      {/* Bulk actions */}
      <AnimatePresence>
        {selecting && (
          <m.div
            key="bulk"
            className="fixed inset-x-0 z-30 px-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-6 flex justify-center pointer-events-none"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl bg-ivory p-2 pl-2 border border-blue/15 shadow-[0_16px_36px_-18px_rgba(15,47,73,0.55)]">
              <button onClick={exitSelect} aria-label="Cancel selection" className="h-11 w-11 shrink-0 grid place-items-center rounded-xl text-muted hover:bg-blue/10"><X size={18} /></button>
              <span className="flex-1 min-w-0 text-sm font-medium text-ink tabular truncate">{sel.size ? `${sel.size} selected` : "Tap to select"}</span>
              <button
                onClick={() => {
                  cleanUp(selItems);
                  exitSelect();
                }}
                disabled={!sel.size || !aiReady}
                title={aiReady ? undefined : "Needs AI switched on"}
                className="h-11 shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-blue/20 px-3 text-xs font-semibold text-blue active:scale-95 transition-transform motion-reduce:transition-none disabled:opacity-40"
              >
                <Wand2 size={15} /> Clean up
              </button>
              <button
                onClick={() => {
                  removeItems(selItems);
                  exitSelect();
                }}
                disabled={!sel.size}
                className="h-11 shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-coral-deep px-3 text-xs font-semibold text-white active:scale-95 transition-transform motion-reduce:transition-none disabled:opacity-40"
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <ActionSheet
        open={Boolean(menu && (menuPiece || menuItem))}
        title={menu?.kind === "piece" ? `Retry ${menuPiece?.tags?.name || "this piece"}` : menuItem?.name ?? "Item"}
        subtitle={menu?.kind === "item" && aiReady ? "Cut out again and Plain crop use one AI check." : undefined}
        actions={menu?.kind === "piece" ? pieceActions : itemActions}
        onPick={pickMenu}
        onClose={() => setMenu(null)}
      />

      <AnimatePresence>
        {sheet?.kind === "piece" && sheetPiece && (
          <ModifySheet
            key={`p-${sheetPiece.key}`}
            title="Edit piece"
            tags={draftOf(sheetPiece.tags)}
            preview={sheetPiece.preview}
            previewWhite
            photo={sheet.photo}
            box={unionBox(sheetPiece.boxes)}
            cut={sheetPiece.kind === "crop" ? "crop" : "cutout"}
            onApply={(r) => applyPiece(sheet.job, sheet.piece, r)}
            onClose={closeSheet}
          />
        )}
        {sheet?.kind === "add" && (
          <ModifySheet key={`a-${sheet.job}`} title="Add a missed piece" tags={{ ...EMPTY_DRAFT }} photo={sheet.photo} box={null} cut="cutout" startOn="crop" onApply={(r) => addPiece(sheet.job, r)} onClose={closeSheet} />
        )}
        {sheet?.kind === "item" && sheetItem && (
          <ModifySheet
            key={`i-${sheetItem.id}`}
            title="Edit item"
            tags={{ ...draftOf(null), name: sheetItem.name ?? "", category: sheetItem.category, subcategory: sheetItem.subcategory, colors: sheetItem.colors, pattern: sheetItem.pattern, fabric: sheetItem.fabric, formality: sheetItem.formality, seasons: sheetItem.seasons, styles: sheetItem.styles, notes: sheetItem.notes }}
            preview={sheetItem.thumb_url}
            previewWhite={sheetItem.image_kind === "cutout"}
            photo={signer}
            box={null}
            cut="cutout"
            startOn={sheet.startOn}
            showNotes
            applyLabel="Save"
            onClose={closeSheet}
            onApply={(r) => {
              const it = sheetItem;
              setSheet(null);
              void saveTags(it, r.tags);
              if (r.boxChanged && r.box) redoItem(it, r.cut, r.box);
              else toast.show("Changes saved");
            }}
            footer={
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {aiReady && (
                  <button onClick={() => { setSheet(null); tag([sheetItem.id]); }} className="h-11 inline-flex items-center gap-1.5 rounded-full border border-blue/20 px-4 text-xs font-semibold text-blue hover:bg-blue/[0.06]"><Sparkles size={14} /> Re-tag with AI</button>
                )}
                <button onClick={() => removeItems([sheetItem])} className="ml-auto h-11 inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-coral-deep hover:bg-coral/15"><Trash2 size={15} /> Delete</button>
              </div>
            }
          />
        )}
      </AnimatePresence>

      <UndoToast toast={toast.toast} onUndo={toast.undo} onDismiss={toast.dismiss} />
    </div>
  );
}
