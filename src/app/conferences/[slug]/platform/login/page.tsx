/**
 * /conferences/[slug]/platform/login — Above & Beyond branded sign-in.
 * Dark hero mirrors the public abovebeyondsummit.com home page; the
 * sign-in form sits in the ivory card below the logo lockup. No Google
 * sign-in — email + password only.
 */
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AboveBeyondHero,
  BRAND_GOLD, BRAND_GOLD_L, BRAND_GOLD_D, BRAND_IVORY, BRAND_GREY, BRAND_BORDER,
} from "../AboveBeyondBrand";

export default function PlatformLoginPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.push(`/conferences/${slug}/platform`);
    });
  }, [slug, router]);

  async function signIn() {
    setError(null); setInfo(null);
    if (!email || !password) { setError("Enter your email and password."); return; }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setError(error.message); setBusy(false); return; }
    router.push(`/conferences/${slug}/platform`);
    router.refresh();
  }

  async function resend() {
    setError(null); setInfo(null);
    if (!email) { setError("Enter your email first, then tap the link."); return; }
    setResendBusy(true);
    const res = await fetch(`/api/platform/invites/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), slug }),
    });
    setResendBusy(false);
    if (!res.ok) {
      try { const j = await res.json(); setError(j.error ?? "Could not send link."); return; }
      catch { setError("Could not send link."); return; }
    }
    setInfo("If that email is registered for this conference, we just sent a link.");
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    borderColor: BRAND_BORDER,
    color: BRAND_IVORY,
    fontSize: 16,
  };
  const labelStyle: React.CSSProperties = {
    color: BRAND_GOLD_L,
    letterSpacing: "0.14em",
  };

  return (
    <AboveBeyondHero>
      <h1 className="font-serif text-3xl font-medium tracking-wide" style={{ color: BRAND_IVORY }}>
        Attendee sign-in
      </h1>
      <p className="mt-1 text-sm" style={{ color: BRAND_GREY }}>
        Enter the email you registered with.
      </p>

      {error && (
        <div className="mt-4 rounded-sm border px-3 py-2 text-sm"
          style={{ borderColor: "#5a2a2a", backgroundColor: "#2a1414", color: "#f5c5c5" }}>
          {error}
        </div>
      )}
      {info && (
        <div className="mt-4 rounded-sm border px-3 py-2 text-sm"
          style={{ borderColor: BRAND_GOLD_D, backgroundColor: "rgba(201,162,75,0.08)", color: BRAND_IVORY }}>
          {info}
        </div>
      )}

      <label className="mt-5 block text-[11px] font-medium uppercase" style={labelStyle}>Email</label>
      <input className="mt-1 w-full rounded-sm border px-3 py-3 focus:outline-none"
        style={inputStyle}
        type="email" autoComplete="email"
        value={email} onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        onKeyDown={e => { if (e.key === "Enter") signIn(); }} />

      <label className="mt-4 block text-[11px] font-medium uppercase" style={labelStyle}>Password</label>
      <input className="mt-1 w-full rounded-sm border px-3 py-3 focus:outline-none"
        style={inputStyle}
        type="password" autoComplete="current-password"
        value={password} onChange={e => setPassword(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") signIn(); }} />

      <button
        onClick={signIn}
        disabled={busy}
        className="mt-6 w-full rounded-sm py-3 text-sm font-semibold uppercase tracking-[0.22em] transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: BRAND_GOLD, color: BRAND_BLACK_CONTRAST }}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <div className="mt-6 border-t pt-5" style={{ borderColor: BRAND_BORDER }}>
        <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: BRAND_GREY }}>
          Need a login link?
        </div>
        <button
          onClick={resend}
          disabled={resendBusy}
          className="mt-2 w-full rounded-sm border py-2.5 text-xs font-semibold uppercase tracking-[0.22em] transition-colors hover:bg-black/40 disabled:opacity-50"
          style={{ borderColor: BRAND_GOLD, color: BRAND_GOLD }}
        >
          {resendBusy ? "Sending…" : "Email me a link"}
        </button>
        <p className="mt-3 text-xs" style={{ color: BRAND_GREY }}>
          If you&rsquo;ve already set a password you&rsquo;ll get a reset link; otherwise a fresh invite.
        </p>
      </div>
    </AboveBeyondHero>
  );
}

// Deep black for text sitting on the gold button. Kept inline rather than
// exported from AboveBeyondBrand to avoid growing that surface.
const BRAND_BLACK_CONTRAST = "#0a0a0a";
