"use client";
import { motion } from "motion/react";
import { Cloud, CloudRain, CloudSnow, CloudSun, Moon, Sun, Wind, Droplets, CloudLightning, CloudFog } from "lucide-react";
import type { Weather } from "@/lib/types";
import { ShimmerLine } from "./amicro/shimmer-line";

function Icon({ code, day }: { code: number | null; day: boolean | null }) {
  const p = { size: 40, strokeWidth: 1.5 };
  if (code == null) return <Cloud {...p} />;
  if (code === 0 || code === 1) return day === false ? <Moon {...p} /> : <Sun {...p} />;
  if (code === 2) return <CloudSun {...p} />;
  if (code === 45 || code === 48) return <CloudFog {...p} />;
  if (code >= 95) return <CloudLightning {...p} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow {...p} />;
  if (code >= 51) return <CloudRain {...p} />;
  return <Cloud {...p} />;
}

export function WeatherCard({ w, loading, compact = false }: { w: Weather | null; loading?: boolean; compact?: boolean }) {
  if (loading)
    return (
      <div className="paper-blue rounded-[22px] p-5 text-ivory min-h-[132px] flex flex-col justify-center gap-3">
        <span className="nav-label text-ivory/80">Checking the sky</span>
        <ShimmerLine className="w-32 !bg-ivory/20" />
      </div>
    );
  if (!w) return null;
  const ok = w.source === "forecast";
  const t = w.at ? new Date(w.at) : null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.5 }} className={`paper-blue rounded-[22px] text-ivory ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="nav-label text-ivory/80 truncate">{w.place || "Destination"}</p>
          {t && ok && <p className="text-xs text-ivory/70 mt-1 tabular">{t.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric" })} local</p>}
        </div>
        <span className="text-coral"><Icon code={w.code} day={w.is_day} /></span>
      </div>
      {ok ? (
        <>
          <div className="mt-2 flex items-end gap-3">
            <span className="display text-5xl tabular">{Math.round(w.temp_c ?? 0)}°</span>
            <span className="pb-1 text-sm text-ivory/85">
              {w.summary}
              <br />feels {Math.round(w.feels_c ?? 0)}° · {Math.round(w.daily_min ?? 0)}–{Math.round(w.daily_max ?? 0)}°
            </span>
          </div>
          <div className="mt-3 flex gap-4 text-xs text-ivory/85 tabular">
            <span className="inline-flex items-center gap-1"><Droplets size={13} /> {w.precip_prob ?? 0}% rain</span>
            <span className="inline-flex items-center gap-1"><Wind size={13} /> {Math.round(w.wind_kmh ?? 0)} km/h</span>
            {w.uv != null && <span>UV {Math.round(w.uv)}</span>}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-ivory/85">{w.summary}. We&apos;ll style for the usual climate there.</p>
      )}
    </motion.div>
  );
}
