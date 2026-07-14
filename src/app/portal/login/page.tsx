/**
 * /portal/login — attendee-facing sign-in page (email + password only).
 * Visually differentiated from the staff /login by dropping the "internal"
 * label + Google OAuth + sign-up options. Attendees sign up via invite tokens
 * on /portal/accept, not here.
 */
"use client";
import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TDD_LOGO = "https://thedeepdive.ca/wp-content/uploads/2025/04/thedeepdive_full.png";
const RED = "#C8102E";

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).toUpperCase();
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/portal";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setError(null); setInfo(null);
    if (!email) { setError("Email is required"); return; }
    setLoading(true);
    const supabase = createClient();

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/portal/login`,
      });
      if (error) { setError(error.message); setLoading(false); return; }
      setInfo("If that email is registered, a reset link has been sent.");
      setLoading(false);
      return;
    }

    if (!password) { setError("Password is required"); setLoading(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push(next);
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
            <h1 className="font-display text-2xl font-bold text-ink">
              {mode === "signin" ? "Sign in" : "Reset password"}
            </h1>
            <p className="mt-2 text-xs text-muted">
              {mode === "signin"
                ? "For attendees of a Deep Dive conference."
                : "Enter your email — we'll send a reset link."}
            </p>
          </div>

          {error && <div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
          {info && <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}

          <div className="mt-6">
            <label className={label}>Email</label>
            <input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email"
              onKeyDown={e => { if (e.key === "Enter") submit(); }} />

            {mode === "signin" && (
              <>
                <label className={label}>Password</label>
                <input className={input} type="password" value={password}
                  onChange={e => setPassword(e.target.value)} autoComplete="current-password"
                  onKeyDown={e => { if (e.key === "Enter") submit(); }} />
              </>
            )}
          </div>

          <button onClick={submit} disabled={loading}
            style={{ backgroundColor: RED, color: "#FFFFFF" }}
            className="mt-6 w-full px-4 py-3 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50">
            {loading ? "…" : mode === "signin" ? "Sign in" : "Send reset email"}
          </button>

          <div className="mt-3 flex justify-between text-xs text-muted">
            {mode === "signin"
              ? (
                <button onClick={() => { setMode("reset"); setError(null); setInfo(null); }}
                  className="hover:text-ink"><span className="underline">Forgot password?</span></button>
              )
              : (
                <button onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                  className="hover:text-ink"><span className="underline">← Back to sign in</span></button>
              )}
          </div>

          <p className="mt-6 text-[10px] uppercase tracking-widest2 text-muted text-center">
            No account? Look for your invite email — it contains a one-click link<br />
            to set your password.
          </p>

          <p className="mt-4 text-center text-[10px] uppercase tracking-widest2 text-muted">
            <Link href="/login" className="hover:text-ink"><span className="underline">Staff sign-in →</span></Link>
          </p>
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

export default function PortalLoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
