/**
 * /conferences/[slug]/platform/login — minimal mobile-first email+password
 * form plus a "need a login link?" resend action for attendees who've lost
 * their invite email. Styled plainly (no CRM branding).
 */
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    // If already signed in, bounce in. Guard still runs server-side.
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
    // Always render a soft success — the API intentionally doesn't leak
    // whether the email is registered.
    if (!res.ok) {
      try { const j = await res.json(); setError(j.error ?? "Could not send link."); return; }
      catch { setError("Could not send link."); return; }
    }
    setInfo("If that email is registered for this conference, we just sent a link.");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter the email you registered with.
        </p>

        {error && <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
        {info && <div className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</div>}

        <label className="mt-5 block text-sm font-medium text-slate-700">Email</label>
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base"
          style={{ fontSize: 16 }}
          type="email" autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          onKeyDown={e => { if (e.key === "Enter") signIn(); }} />

        <label className="mt-4 block text-sm font-medium text-slate-700">Password</label>
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base"
          style={{ fontSize: 16 }}
          type="password" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") signIn(); }} />

        <button onClick={signIn} disabled={busy}
          className="mt-6 w-full rounded-md bg-slate-900 py-3 text-base font-medium text-white disabled:opacity-50"
          style={{ minHeight: 48 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-600">
          <p>Need a login link?</p>
          <button onClick={resend} disabled={resendBusy}
            className="mt-2 text-slate-900 underline disabled:opacity-50"
            style={{ minHeight: 32 }}>
            {resendBusy ? "Sending…" : "Email me a link"}
          </button>
          <p className="mt-2 text-xs text-slate-500">
            We&rsquo;ll either send you a password-reset link (if you&rsquo;ve already set a
            password) or a fresh invite to pick one.
          </p>
        </div>
      </main>
    </div>
  );
}
