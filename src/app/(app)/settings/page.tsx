import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/storage";
import { ProfileForm } from "@/components/profile-form";
import { DangerZone } from "./danger-zone";

export const metadata: Metadata = { title: "Profile" };

export default async function Settings() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const profile = await getProfile(supabase, user.id, user.user_metadata?.full_name);
  return (
    <div className="pt-8 max-w-2xl">
      <h1 className="display-condensed text-blue text-[clamp(2.8rem,10vw,5rem)]">Profile</h1>
      <p className="mt-2 text-muted">Signed in as {user.email}</p>
      <div className="mt-6"><ProfileForm initial={profile ?? { id: user.id }} mode="settings" /></div>
      <DangerZone />
    </div>
  );
}
