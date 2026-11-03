import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/storage";
import { ProfileForm } from "@/components/profile-form";

export const metadata: Metadata = { title: "Your style profile" };

export default async function Onboarding() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const profile = await getProfile(supabase, user.id, user.user_metadata?.full_name);
  return (
    <div className="max-w-2xl pt-8">
      <h1 className="display-condensed text-blue text-[clamp(2.8rem,10vw,4.5rem)]">Tell us your style</h1>
      <p className="mt-3 text-lg text-muted">Two minutes now means every outfit fits you. Change any of it later.</p>
      <div className="mt-6">
        <ProfileForm initial={profile ?? { id: user.id }} mode="onboarding" />
      </div>
    </div>
  );
}
