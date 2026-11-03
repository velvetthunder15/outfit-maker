import { NextResponse } from "next/server";
import { getWeather, reverseName } from "@/lib/weather";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  let place = sp.get("place") ?? "";
  if (!place) place = await reverseName(lat, lon);
  const w = await getWeather(lat, lon, sp.get("at"), place);
  return NextResponse.json(w);
}
