import type { GeoPlace, Weather } from "./types";

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Rain showers",
  82: "Violent showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, hail",
};
export const describeCode = (c: number | null | undefined) => (c == null ? "Unknown" : WMO[c] ?? "Mixed");

export async function geocode(q: string, count = 6): Promise<GeoPlace[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`;
  const r = await fetch(url, { next: { revalidate: 86400 } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.results ?? []).map((x: Record<string, unknown>) => ({
    name: x.name as string,
    lat: x.latitude as number,
    lon: x.longitude as number,
    country: x.country as string | undefined,
    admin1: x.admin1 as string | undefined,
    timezone: x.timezone as string | undefined,
  }));
}

/**
 * Weather at a place for a local date+hour ("2026-11-04T19:00"). Uses Open-Meteo forecast (16 days).
 */
export async function getWeather(lat: number, lon: number, localIso: string | null, place = ""): Promise<Weather> {
  const base: Weather = {
    place, lat, lon, at: localIso ?? "", temp_c: null, feels_c: null, precip_prob: null, precip_mm: null,
    wind_kmh: null, humidity: null, uv: null, code: null, summary: "Weather unavailable", is_day: null,
    daily_min: null, daily_max: null, source: "unavailable",
  };
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,uv_index,is_day",
      daily: "temperature_2m_max,temperature_2m_min",
      timezone: "auto",
      forecast_days: "16",
    });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 900 } });
    if (!r.ok) return base;
    const j = await r.json();
    const times: string[] = j.hourly?.time ?? [];
    if (!times.length) return base;
    let idx = 0;
    if (localIso) {
      const target = localIso.slice(0, 13); // YYYY-MM-DDTHH
      const found = times.findIndex((t) => t.startsWith(target));
      if (found >= 0) idx = found;
      else if (localIso > times[times.length - 1]) return { ...base, summary: "Too far ahead for a forecast" };
    } else {
      const nowLocal = j.current_weather?.time ?? new Date(Date.now() + (j.utc_offset_seconds ?? 0) * 1000).toISOString().slice(0, 13);
      const found = times.findIndex((t) => t.startsWith(String(nowLocal).slice(0, 13)));
      if (found >= 0) idx = found;
    }
    const h = j.hourly;
    const day = times[idx].slice(0, 10);
    const dIdx = (j.daily?.time ?? []).indexOf(day);
    const code = h.weather_code?.[idx] ?? null;
    return {
      place, lat, lon, at: times[idx],
      temp_c: h.temperature_2m?.[idx] ?? null,
      feels_c: h.apparent_temperature?.[idx] ?? null,
      precip_prob: h.precipitation_probability?.[idx] ?? null,
      precip_mm: h.precipitation?.[idx] ?? null,
      wind_kmh: h.wind_speed_10m?.[idx] ?? null,
      humidity: h.relative_humidity_2m?.[idx] ?? null,
      uv: h.uv_index?.[idx] ?? null,
      code,
      summary: describeCode(code),
      is_day: h.is_day?.[idx] == null ? null : h.is_day[idx] === 1,
      daily_min: dIdx >= 0 ? j.daily.temperature_2m_min[dIdx] : null,
      daily_max: dIdx >= 0 ? j.daily.temperature_2m_max[dIdx] : null,
      source: "forecast",
    };
  } catch {
    return base;
  }
}

export async function reverseName(lat: number, lon: number): Promise<string> {
  // Open-Meteo has no reverse geocoder; use BigDataCloud's free client endpoint (no key).
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { next: { revalidate: 86400 } }
    );
    if (!r.ok) return "My location";
    const j = await r.json();
    return [j.city || j.locality, j.principalSubdivision].filter(Boolean).join(", ") || "My location";
  } catch {
    return "My location";
  }
}
