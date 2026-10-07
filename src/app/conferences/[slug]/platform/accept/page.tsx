/**
 * /conferences/[slug]/platform/accept?token=... — attendee sets a password
 * to claim their invite. On success, signs in and redirects into the shell.
 */
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AboveBeyondHeader, BRAND_ACCENT, BRAND_BG } from "../AboveBeyondBrand";

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

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: BRAND_BG }}>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-6"><AboveBeyondHeader /></div>
        <h1 className="font-serif text-2xl font-semibold text-stone-900">Set your password</h1>

        {previewError && (
          <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{previewError}</div>
        )}

        {preview && (
          <>
            <p className="mt-3 text-base text-slate-700">
              Hi {preview.full_name ?? preview.email}, you&rsquo;re invited to{" "}
              <span className="font-medium">{preview.conference_name}</span>
              {preview.entity_name ? <> as <span className="font-medium">{preview.entity_name}</span></> : null}.
              Set a password to continue.
            </p>
            <div className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Sign-in email</div>
              <div className="mt-1 font-medium text-slate-800">{preview.email}</div>
            </div>

            {error && <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

            <label className="mt-5 block text-sm font-medium text-slate-700">New password</label>
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3"
              style={{ fontSize: 16 }}
              type="password" autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              onKeyDown={e => { if (e.key === "Enter") submit(); }} />

            <label className="mt-4 block text-sm font-medium text-slate-700">Confirm password</label>
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3"
              style={{ fontSize: 16 }}
              type="password" autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }} />

            <button onClick={submit} disabled={busy}
              className="mt-6 w-full rounded-md py-3 text-base font-medium text-white disabled:opacity-50"
              style={{ minHeight: 48, backgroundColor: BRAND_ACCENT }}>
              {busy ? "Working…" : "Set password & continue"}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
