"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MagneticButton } from "@/components/amicro/magnetic-button";
import { BounceDots } from "@/components/amicro/bounce-dots";

export function MagicLinkForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        const { error } = await createClient().auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) {
          setState("error");
          setMsg(error.message);
        } else setState("sent");
      }}
      className="space-y-3"
    >
      <label htmlFor="email" className="nav-label text-blue">Email me a sign-in link</label>
      <input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
      <MagneticButton type="submit" variant="ghost" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? <BounceDots className="bg-blue" /> : "Send link"}
      </MagneticButton>
      {state === "sent" && <p className="text-sm text-blue" role="status">Check your inbox for the sign-in link.</p>}
      {state === "error" && <p className="text-sm text-coral-deep" role="alert">{msg}</p>}
    </form>
  );
}
