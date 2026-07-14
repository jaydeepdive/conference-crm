/**
 * /portal/accept?token=... — set a password to claim an attendee invite.
 * The token is one-shot: server validates + creates an auth user (or updates
 * the password on an existing user with the same email) then clears the token.
 * On success, we sign in with the picked password to establish the cookie
 * session, then send the attendee into /portal/[slug].
 */
"use client";
import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TDD_LOGO = "https://thedeepdive.ca/wp-content/uploads/2025/04/thedeepdive_full.png";
const RED = "#C8102E";

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).toUpperCase();
}

interface Preview { email: string; conference_name: string | null; slug: string | null }

function AcceptForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setPreviewError("Missing invite token."); return; }
    (async () => {
      const res = await fetch(`/api/portal/invites/preview?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok) { setPreviewError(json.error ?? "Invite is not valid."); return; }
      setPreview(json);
    })();
  }, [token]);

  async function submit() {
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setSubmitting(true);
    const acceptRes = await fetch("/api/portal/accept", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const acceptJson = await acceptRes.json();
    if (!acceptRes.ok) { setError(acceptJson.error ?? "Something went wrong."); setSubmitting(false); return; }

    // Sign in to establish the cookie session on this device.
    const supabase = createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: acceptJson.email, password,
    });
    if (signInErr) { setError(signInErr.message); setSubmitting(false); return; }

    const target = acceptJson.slug ? `/portal/${acceptJson.slug}` : "/portal";
    router.push(target);
    router.refresh();
  }

  const input = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-[#C8102E] focus:outline-none";
  const label = "block text-[10px] font-medium uppercase tracking-widest2 text-muted mb-1 mt-3";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="border-b border-line bg-utility">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-[11px] font-medium uppercase tracking-widest2 text-muted">
          <span>{formatToday()}</span>
          <span>Attendee portal</span>
        </div>
      </div>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md border border-line bg-white p-10">
          <div className="text-center">
            <Image src={TDD_LOGO} alt="The Deep Dive" width={420} height={66}
              priority unoptimized className="mx-auto h-12 w-auto sm:h-14" />
            <p className="mt-3 text-[11px] font-medium uppercase tracking-widest2 text-muted">Attendee Portal</p>
            <div className="mx-auto my-5 max-w-[200px] border-b border-ink" />
            <h1 className="font-display text-2xl font-bold text-ink">Set your password</h1>
          </div>

          {previewError && (
            <div className="mt-6 rounded-md bg-rose-50 p-4 text-sm text-rose-800">{previewError}</div>
          )}

          {preview && (
            <>
              <div className="mt-6 border border-line bg-utility p-4 text-sm">
                <div className="text-[10px] uppercase tracking-widest2 text-muted">You are accepting an invite to</div>
                <div className="mt-1 font-semibold text-ink">{preview.conference_name}</div>
                <div className="mt-3 text-[10px] uppercase tracking-widest2 text-muted">Sign-in email</div>
                <div className="mt-1 font-medium text-ink">{preview.email}</div>
              </div>

              {error && <div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

              <label className={label}>New password</label>
              <input className={input} type="password" value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="new-password"
                placeholder="At least 8 characters"
                onKeyDown={e => { if (e.key === "Enter") submit(); }} />

              <label className={label}>Confirm password</label>
              <input className={input} type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)} autoComplete="new-password"
                onKeyDown={e => { if (e.key === "Enter") submit(); }} />

              <button onClick={submit} disabled={submitting}
                style={{ backgroundColor: RED, color: "#FFFFFF" }}
                className="mt-6 w-full px-4 py-3 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50">
                {submitting ? "…" : "Set password & enter portal"}
              </button>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-line bg-white py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-6 text-[11px] font-medium uppercase tracking-widest2 text-muted">
          The Deep Dive · Attendee Portal
        </div>
      </footer>
    </div>
  );
}

export default function AcceptPage() {
  return <Suspense><AcceptForm /></Suspense>;
}
