"use client";
import { useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { BounceDots } from "@/components/amicro/bounce-dots";

export function DangerZone() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-16 border-t border-blue/15 pt-8 space-y-8">
      <form action="/auth/signout" method="post">
        <button className="h-11 px-5 rounded-full border border-blue/30 text-blue inline-flex items-center gap-2 text-sm font-medium hover:border-blue"><LogOut size={16} /> Sign out</button>
      </form>
      <div>
        <h2 className="text-lg font-semibold text-coral-deep">Delete my data</h2>
        <p className="mt-1 text-sm text-muted max-w-lg">Permanently removes your style profile, every wardrobe photo, all outfits and ratings. This can&apos;t be undone.</p>
        <button
          disabled={busy}
          onClick={async () => {
            if (step === 0) return setStep(1);
            setBusy(true);
            const r = await fetch("/api/account", { method: "DELETE" });
            if (r.ok) window.location.href = "/?deleted=1";
            else { setBusy(false); setStep(0); alert("Couldn't delete right now. Try again in a minute."); }
          }}
          className={`mt-4 h-11 px-5 rounded-full inline-flex items-center gap-2 text-sm font-semibold transition-colors ${step ? "bg-coral-deep text-white" : "text-coral-deep border border-coral-deep/40 hover:bg-coral/10"}`}
        >
          {busy ? <BounceDots className="bg-white" /> : <><Trash2 size={16} /> {step ? "Yes, delete everything" : "Delete my data"}</>}
        </button>
      </div>
    </section>
  );
}
