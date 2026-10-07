/**
 * /conferences/[slug]/platform/reset — attendee "choose a new password".
 * Reached from the reset email via /auth/callback?next=<this page>.
 */
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AboveBeyondHero, BRAND_GOLD, BRAND_GOLD_L, BRAND_IVORY, BRAND_GREY, BRAND_BORDER,
} from "../AboveBeyondBrand";

export default function PlatformResetPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace(`/conferences/${slug}/platform/login`);
      else setEmail(data.user.email ?? null);
    });
  }, [slug, router]);

  async function save() {
    setError(null);
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.push(`/conferences/${slug}/platform`);
    router.refresh();
  }

  const inputStyle: React.CSSProperties = { backgroundColor: "transparent", borderColor: BRAND_BORDER, color: BRAND_IVORY, fontSize: 16 };
  const labelStyle: React.CSSProperties = { color: BRAND_GOLD_L, letterSpacing: "0.14em" };

  return (
    <AboveBeyondHero>
      <h1 className="font-serif text-3xl font-medium tracking-wide" style={{ color: BRAND_IVORY }}>
        Choose a new password
      </h1>
      {email && <p className="mt-1 text-sm" style={{ color: BRAND_GREY }}>{email}</p>}
      {error && (
        <div className="mt-4 rounded-sm border px-3 py-2 text-sm"
          style={{ borderColor: "#5a2a2a", backgroundColor: "#2a1414", color: "#f5c5c5" }}>{error}</div>
      )}
      <label className="mt-5 block text-[11px] font-medium uppercase" style={labelStyle}>New password</label>
      <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)}
        className="mt-1 w-full rounded-sm border px-3 py-3 focus:outline-none" style={inputStyle} />
      <label className="mt-4 block text-[11px] font-medium uppercase" style={labelStyle}>Confirm</label>
      <input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); }}
        className="mt-1 w-full rounded-sm border px-3 py-3 focus:outline-none" style={inputStyle} />
      <button onClick={save} disabled={busy}
        className="mt-6 w-full rounded-sm py-3 text-sm font-semibold uppercase tracking-[0.22em] hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: BRAND_GOLD, color: "#0a0a0a" }}>
        {busy ? "Saving…" : "Save & continue"}
      </button>
    </AboveBeyondHero>
  );
}
