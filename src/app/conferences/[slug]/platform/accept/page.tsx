/**
 * /conferences/[slug]/platform/accept?token=... — attendee sets a password
 * to claim their invite. Dark Above & Beyond branding to match the login
 * page. On success, signs in and redirects into the shell.
 */
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AboveBeyondHero,
  BRAND_GOLD, BRAND_GOLD_L, BRAND_IVORY, BRAND_GREY, BRAND_BORDER,
} from "../AboveBeyondBrand";

interface Preview {
  email: string;
  full_name: string | null;
  entity_name: string | null;
  conference_name: string | null;
}

export default function PlatformAcceptPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setPreviewError("Missing invite token."); return; }
    (async () => {
      const res = await fetch(`/api/platform/invites/preview?token=${encodeURIComponent(token)}`);
      const j = await res.json();
      if (!res.ok) { setPreviewError(j.error ?? "Invite is not valid."); return; }
      setPreview(j);
    })();
  }, [token]);

  async function submit() {
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    const res = await fetch("/api/platform/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const j = await res.json();
    if (!res.ok) { setError(j.error ?? "Something went wrong."); setBusy(false); return; }

    const supabase = createClient();
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: j.email, password,
    });
    if (signErr) { setError(signErr.message); setBusy(false); return; }
    router.push(`/conferences/${slug}/platform`);
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    borderColor: BRAND_BORDER,
    color: BRAND_IVORY,
    fontSize: 16,
  };
  const labelStyle: React.CSSProperties = { color: BRAND_GOLD_L, letterSpacing: "0.14em" };

  return (
    <AboveBeyondHero>
      <h1 className="font-serif text-3xl font-medium tracking-wide" style={{ color: BRAND_IVORY }}>
        Set your password
      </h1>

      {previewError && (
        <div className="mt-4 rounded-sm border px-3 py-2 text-sm"
          style={{ borderColor: "#5a2a2a", backgroundColor: "#2a1414", color: "#f5c5c5" }}>
          {previewError}
        </div>
      )}

      {preview && (
        <>
          <p className="mt-3 text-sm" style={{ color: BRAND_IVORY }}>
            Hi {preview.full_name ?? preview.email}, you&rsquo;re invited to{" "}
            <span className="font-medium" style={{ color: BRAND_GOLD_L }}>{preview.conference_name}</span>
            {preview.entity_name ? (<> as <span className="font-medium" style={{ color: BRAND_GOLD_L }}>{preview.entity_name}</span></>) : null}.
            Set a password to continue.
          </p>
          <div className="mt-4 rounded-sm border px-3 py-2 text-sm"
            style={{ borderColor: BRAND_BORDER, backgroundColor: "rgba(201,162,75,0.06)" }}>
            <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: BRAND_GREY }}>Sign-in email</div>
            <div className="mt-1" style={{ color: BRAND_IVORY }}>{preview.email}</div>
          </div>

          {error && (
            <div className="mt-4 rounded-sm border px-3 py-2 text-sm"
              style={{ borderColor: "#5a2a2a", backgroundColor: "#2a1414", color: "#f5c5c5" }}>
              {error}
            </div>
          )}

          <label className="mt-5 block text-[11px] font-medium uppercase" style={labelStyle}>New password</label>
          <input className="mt-1 w-full rounded-sm border px-3 py-3 focus:outline-none"
            style={inputStyle}
            type="password" autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            onKeyDown={e => { if (e.key === "Enter") submit(); }} />

          <label className="mt-4 block text-[11px] font-medium uppercase" style={labelStyle}>Confirm password</label>
          <input className="mt-1 w-full rounded-sm border px-3 py-3 focus:outline-none"
            style={inputStyle}
            type="password" autoComplete="new-password"
            value={confirm} onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }} />

          <button onClick={submit} disabled={busy}
            className="mt-6 w-full rounded-sm py-3 text-sm font-semibold uppercase tracking-[0.22em] transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND_GOLD, color: "#0a0a0a", minHeight: 48 }}>
            {busy ? "Working…" : "Set password & continue"}
          </button>
        </>
      )}
    </AboveBeyondHero>
  );
}
