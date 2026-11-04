"use client";
// Draggable / resizable / pinchable crop box over the original photo.
// Perf: the box lives in a ref while a finger is down and is painted once per frame by writing SVG
// attributes + handle transforms directly (no React render per pointermove). React only hears about
// the box on pointerup.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Box } from "@/lib/cutout/core";

type R = { x0: number; y0: number; x1: number; y1: number }; // fractions 0-1
const MIN = 0.04;
const HIT = 30; // px radius for grabbing a corner (>= 44 px target)

const toR = (b: Box): R => ({ y0: Math.min(b[0], b[2]) / 1000, x0: Math.min(b[1], b[3]) / 1000, y1: Math.max(b[0], b[2]) / 1000, x1: Math.max(b[1], b[3]) / 1000 });
const toBox = (r: R): Box => [Math.round(r.y0 * 1000), Math.round(r.x0 * 1000), Math.round(r.y1 * 1000), Math.round(r.x1 * 1000)];
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function CropEditor({ src, box, onChange, emptyHint = "Drag on the photo around the piece" }: { src: string; box: Box | null; onChange: (b: Box | null) => void; emptyHint?: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const svgRect = useRef<SVGRectElement>(null);
  const dim = useRef<SVGPathElement>(null);
  const handles = useRef<(HTMLSpanElement | null)[]>([]);
  const r = useRef<R | null>(box ? toR(box) : null);
  const size = useRef({ w: 1, h: 1 });
  const frame = useRef(0);
  const [has, setHas] = useState(Boolean(box));

  const paint = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const b = r.current;
      const { w, h } = size.current;
      if (!svgRect.current || !dim.current) return;
      if (!b) {
        svgRect.current.setAttribute("visibility", "hidden");
        dim.current.setAttribute("d", "");
        handles.current.forEach((el) => el && (el.style.opacity = "0"));
        return;
      }
      const X0 = b.x0 * 1000, Y0 = b.y0 * 1000, X1 = b.x1 * 1000, Y1 = b.y1 * 1000;
      svgRect.current.setAttribute("visibility", "visible");
      svgRect.current.setAttribute("x", String(X0));
      svgRect.current.setAttribute("y", String(Y0));
      svgRect.current.setAttribute("width", String(X1 - X0));
      svgRect.current.setAttribute("height", String(Y1 - Y0));
      dim.current.setAttribute("d", `M0 0H1000V1000H0Z M${X0} ${Y0}V${Y1}H${X1}V${Y0}Z`);
      const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]];
      handles.current.forEach((el, i) => {
        if (!el) return;
        el.style.opacity = "1";
        el.style.transform = `translate3d(${pts[i][0] * w - 11}px, ${pts[i][1] * h - 11}px, 0)`;
      });
    });
  }, []);

  // Keep the overlay in sync with the rendered photo size.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      size.current = { w: el.clientWidth || 1, h: el.clientHeight || 1 };
      paint();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [paint, ratio]);

  // External resets (e.g. "Whole photo" button).
  const ext = box ? box.join(",") : "";
  useEffect(() => {
    r.current = box ? toR(box) : null;
    setHas(Boolean(box));
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext, paint]);

  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ mode: "move" | "corner" | "draw" | "pinch"; corner?: number; start: R | null; sx: number; sy: number; d0?: number } | null>(null);

  const local = (e: React.PointerEvent) => {
    const rect = wrap.current!.getBoundingClientRect();
    size.current = { w: rect.width || 1, h: rect.height || 1 };
    return { x: clamp((e.clientX - rect.left) / rect.width), y: clamp((e.clientY - rect.top) / rect.height) };
  };
  const dist = () => {
    const [a, b] = Array.from(ptrs.current.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function down(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    const b = r.current;
    if (ptrs.current.size === 2 && b) {
      g.current = { mode: "pinch", start: { ...b }, sx: 0, sy: 0, d0: Math.max(0.01, dist()) };
      return;
    }
    if (ptrs.current.size > 1) return;
    const { w, h } = size.current;
    if (b) {
      const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]];
      let best = -1, bd = HIT;
      corners.forEach(([cx, cy], i) => {
        const d = Math.hypot((cx - p.x) * w, (cy - p.y) * h);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) return void (g.current = { mode: "corner", corner: best, start: { ...b }, sx: p.x, sy: p.y });
      if (p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1) return void (g.current = { mode: "move", start: { ...b }, sx: p.x, sy: p.y });
    }
    g.current = { mode: "draw", start: null, sx: p.x, sy: p.y };
  }

  function move(e: React.PointerEvent) {
    if (!ptrs.current.has(e.pointerId) || !g.current) return;
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    const s = g.current;
    const st = s.start;
    if (s.mode === "pinch" && st && ptrs.current.size >= 2) {
      const k = dist() / (s.d0 ?? 1);
      const cx = (st.x0 + st.x1) / 2, cy = (st.y0 + st.y1) / 2;
      const hw = clamp(((st.x1 - st.x0) * k) / 2, MIN / 2, 0.5), hh = clamp(((st.y1 - st.y0) * k) / 2, MIN / 2, 0.5);
      r.current = { x0: clamp(cx - hw), y0: clamp(cy - hh), x1: clamp(cx + hw), y1: clamp(cy + hh) };
    } else if (s.mode === "move" && st) {
      const dx = clamp(p.x - s.sx, -st.x0, 1 - st.x1), dy = clamp(p.y - s.sy, -st.y0, 1 - st.y1);
      r.current = { x0: st.x0 + dx, y0: st.y0 + dy, x1: st.x1 + dx, y1: st.y1 + dy };
    } else if (s.mode === "corner" && st) {
      const n = { ...st };
      const c = s.corner!;
      if (c === 0 || c === 2) n.x0 = Math.min(p.x, st.x1 - MIN); else n.x1 = Math.max(p.x, st.x0 + MIN);
      if (c === 0 || c === 1) n.y0 = Math.min(p.y, st.y1 - MIN); else n.y1 = Math.max(p.y, st.y0 + MIN);
      r.current = n;
    } else if (s.mode === "draw") {
      if (Math.abs(p.x - s.sx) < 0.01 && Math.abs(p.y - s.sy) < 0.01) return;
      r.current = { x0: Math.min(s.sx, p.x), y0: Math.min(s.sy, p.y), x1: Math.max(s.sx, p.x), y1: Math.max(s.sy, p.y) };
    }
    paint();
  }

  function up(e: React.PointerEvent) {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size) {
      // Pinch -> one finger left: continue as a move from here.
      const [p] = Array.from(ptrs.current.values());
      if (r.current) g.current = { mode: "move", start: { ...r.current }, sx: p.x, sy: p.y };
      return;
    }
    g.current = null;
    const b = r.current;
    if (b && (b.x1 - b.x0 < MIN || b.y1 - b.y0 < MIN)) {
      // A tap, not a drag: keep whatever box there was before.
      r.current = box ? toR(box) : null;
      paint();
      return;
    }
    setHas(Boolean(b));
    onChange(b ? toBox(b) : null);
  }

  return (
    <div className="flex justify-center">
      <div
        ref={wrap}
        className="relative overflow-hidden rounded-2xl bg-paper select-none"
        style={{ aspectRatio: ratio ? String(ratio) : "4 / 5", width: ratio ? `min(100%, calc(52dvh * ${ratio}))` : "min(100%, calc(52dvh * 0.8))" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Original photo"
          draggable={false}
          decoding="async"
          onLoad={(e) => setRatio(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
          className="absolute inset-0 h-full w-full object-fill pointer-events-none"
        />
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
          <path ref={dim} fill="rgba(15,47,73,0.5)" fillRule="evenodd" />
          <rect ref={svgRect} fill="none" stroke="#EF8557" strokeWidth={2.5} vectorEffect="non-scaling-stroke" visibility="hidden" />
        </svg>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            ref={(el) => {
              handles.current[i] = el;
            }}
            aria-hidden
            className="absolute left-0 top-0 h-[22px] w-[22px] rounded-full border-[3px] border-white bg-coral shadow-[0_2px_8px_rgba(15,47,73,0.45)] pointer-events-none opacity-0 will-change-transform"
          />
        ))}
        <div
          className="absolute inset-0 touch-none cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          role="application"
          aria-label="Crop box. Drag the box to move it, drag a corner to resize, pinch to scale, or drag outside it to draw a new one."
        />
        {!has && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-blue-ink/80 px-3 py-2 text-center text-xs font-medium text-ivory om-fade-up" style={{ ["--om-d" as string]: "0.3s" }}>
            {emptyHint}
          </p>
        )}
      </div>
    </div>
  );
}
