import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { withSignedUrls } from "@/lib/storage";
import type { OutfitResult, WardrobeItem } from "@/lib/types";
import { FadeUp } from "@/components/amicro/fade-up";
import { CardGridSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Saved & history" };

export default async function Saved({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "history" ? "history" : "saved";
  // Heading + tabs render immediately; the list streams in behind a skeleton.
  return (
    <div className="pt-8">
      <h1 className="display-condensed text-blue text-[clamp(2.8rem,10vw,5rem)]">Your looks</h1>
      <nav className="mt-5 flex gap-2" aria-label="Filter">
        {[["saved", "Saved"], ["history", "History"]].map(([k, l]) => (
          <Link key={k} href={`/saved?tab=${k}`} scroll={false} className={`h-11 px-5 rounded-full inline-flex items-center text-sm font-medium transition-colors active:scale-95 ${tab === k ? "bg-blue text-ivory" : "border border-blue/25 text-blue hover:border-blue"}`}>{l}</Link>
        ))}
      </nav>
      <Suspense key={tab} fallback={<CardGridSkeleton />}>
        <SavedList tab={tab} />
      </Suspense>
    </div>
  );
}

async function SavedList({ tab }: { tab: "saved" | "history" }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  let q = supabase.from("om_outfits").select("id, title, mood, occasion, destination, created_at, is_saved, item_ids, result, mode").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60);
  if (tab === "saved") q = q.eq("is_saved", true);
  const [{ data: outfits }, { data: fbs }] = await Promise.all([q, supabase.from("om_feedback").select("outfit_id, rating").eq("user_id", user.id)]);
  const ids = Array.from(new Set((outfits ?? []).flatMap((o) => (o.item_ids ?? []).slice(0, 4))));
  // Thumbnails only: select just the columns the cards need.
  const { data: items } = ids.length ? await supabase.from("om_wardrobe_items").select("id, thumb_path, image_path").in("id", ids) : { data: [] };
  const signed = await withSignedUrls(supabase, (items ?? []).map((i) => ({ ...i, image_path: i.thumb_path ? null : i.image_path })) as unknown as WardrobeItem[]);
  const byId = new Map(signed.map((i) => [i.id, i]));
  const rating = new Map((fbs ?? []).map((f) => [f.outfit_id, f.rating]));

  if (!outfits?.length)
    return (
      <div className="mt-16 max-w-md om-fade-up">
        <p className="display-condensed text-blue text-4xl">{tab === "saved" ? "Nothing saved yet" : "No outfits yet"}</p>
        <p className="mt-3 text-muted">{tab === "saved" ? "Tap Save on an outfit you love and it lands here." : "Your generated outfits will show up here."}</p>
        <Link href="/style" className="mt-6 inline-flex rounded-full bg-coral text-blue-ink font-semibold px-6 h-12 items-center active:scale-95 transition-transform">Style me</Link>
      </div>
    );

  return (
    <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {outfits.map((o, idx) => {
        const r = o.result as OutfitResult;
        const thumbs = (o.item_ids ?? []).map((id: string) => byId.get(id)?.thumb_url).filter(Boolean).slice(0, 4) as string[];
        return (
          <li key={o.id}>
            <FadeUp delay={Math.min(idx * 0.03, 0.18)} duration={0.35} yOffset={10}>
              <Link href={`/outfits/${o.id}`} className="group block rounded-[22px] bg-paper border border-blue/10 overflow-hidden hover:border-blue/30 transition-[border-color,scale] duration-200 active:scale-[0.98]">
                <div className="grid grid-cols-4 h-28 bg-ivory-deep">
                  {thumbs.length ? thumbs.map((t, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img decoding="async" loading="lazy" key={i} src={t} alt="" className="h-full w-full object-cover" />
                  )) : (r.palette ?? []).slice(0, 4).map((c) => <span key={c} style={{ background: c }} />)}
                </div>
                <div className="p-4">
                  <p className="font-semibold text-blue group-hover:text-blue-deep leading-snug">{o.title}</p>
                  <p className="mt-1 text-sm text-muted flex justify-between gap-3 tabular">
                    <span className="truncate">{new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {o.mood}</span>
                    <span className="shrink-0">{rating.get(o.id) === 1 ? "Loved" : rating.get(o.id) === -1 ? "Not for me" : o.is_saved ? "Saved" : ""}</span>
                  </p>
                </div>
              </Link>
            </FadeUp>
          </li>
        );
      })}
    </ul>
  );
}
