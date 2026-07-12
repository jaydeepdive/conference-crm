"use client";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

const TDD_LOGO = "https://thedeepdive.ca/wp-content/uploads/2025/04/thedeepdive_full.png";
const RED = "#C8102E";

type Mode = "signin" | "signup" | "reset";

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).toUpperCase();
}

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const initialError = params.get("error");

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? "Sign-in failed. Try again, or check that this email has been invited." : null);
  const [info, setInfo] = useState<string | null>(null);

  async function submitEmailPassword() {
    setError(null); setInfo(null);
    if (!email) { setError("Email is required"); return; }

    setLoading(true);
    const supabase = createClient();

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/login`,
      });
      if (error) { setError(error.message); setLoading(false); return; }
      setInfo("If that email is registered, a reset link has been sent.");
      setLoading(false);
      return;
    }

    if (!password) { setError("Password is required"); setLoading(false); return; }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters"); setLoading(false); return;
    }

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      router.push("/conferences");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { setError(error.message); setLoading(false); return; }
      if (data.user && !data.session) {
        setInfo("Account created. Check your email for a confirmation link, then sign in.");
        setMode("signin");
        setLoading(false);
        return;
      }
      router.push("/conferences");
      router.refresh();
    }
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "https://www.googleapis.com/auth/gmail.send",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  }

  const input = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-[#C8102E] focus:outline-none";
  const label = "block text-[10px] font-medium uppercase tracking-widest2 text-muted mb-1 mt-3";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="border-b border-line bg-utility">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-[11px] font-medium uppercase tracking-widest2 text-muted">
          <span>{formatToday()}</span>
          <span>Mining Summit CRM · internal</span>
        </div>
      </div>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md border border-line bg-white p-10">
          <div className="text-center">
            <Image src={TDD_LOGO} alt="The Deep Dive" width={420} height={66}
              priority unoptimized className="mx-auto h-12 w-auto sm:h-14" />
            <p className="mt-3 text-[11px] font-medium uppercase tracking-widest2 text-muted">Mining Summit CRM</p>
            <div className="mx-auto my-5 max-w-[200px] border-b border-ink"></div>
            <h1 className="font-display text-2xl font-bold text-ink">
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
            </h1>
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
          )}
          {info && (
            <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>
          )}

          <div className="mt-6">
            {mode === "signup" && (
              <>
                <label className={label}>Full name</label>
                <input className={input} value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Doe" autoComplete="name" />
              </>
            )}

            <label className={label}>Email</label>
            <input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email"
              onKeyDown={e => { if (e.key === "Enter") submitEmailPassword(); }} />

            {mode !== "reset" && (
              <>
                <label className={label}>Password</label>
                <input className={input} type="password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 8 characters" : ""}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  onKeyDown={e => { if (e.key === "Enter") submitEmailPassword(); }} />
              </>
            )}
          </div>

          <button onClick={submitEmailPassword} disabled={loading}
            style={{ backgroundColor: RED, color: "#FFFFFF" }}
            className="mt-6 w-full px-4 py-3 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50">
            {loading ? "…" : (mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email")}
          </button>

          <div className="mt-3 flex justify-between text-xs text-muted">
            {mode === "signin" && (
              <>
                <button onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
                  className="hover:text-ink">Need an account? <span className="underline">Sign up</span></button>
                <button onClick={() => { setMode("reset"); setError(null); setInfo(null); }}
                  className="hover:text-ink"><span className="underline">Forgot password?</span></button>
              </>
            )}
            {mode === "signup" && (
              <button onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                className="hover:text-ink">Have an account? <span className="underline">Sign in</span></button>
            )}
            {mode === "reset" && (
              <button onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                className="hover:text-ink"><span className="underline">← Back to sign in</span></button>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3 text-[10px] uppercase tracking-widest2 text-muted">
            <span className="flex-1 border-b border-line"></span>
            OR
            <span className="flex-1 border-b border-line"></span>
          </div>

          <button
            onClick={signInWithGoogle}
            disabled={googleLoading}
            className="mt-4 flex w-full items-center justify-center gap-3 border border-line bg-white px-4 py-3 text-sm font-medium text-ink hover:border-brand-accent disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
            </svg>
            {googleLoading ? "Redirecting…" : "Sign in with Google"}
          </button>

          <p className="mt-6 text-[10px] uppercase tracking-widest2 text-muted text-center">
            Google sign-in also unlocks the &ldquo;Send invoice via Gmail&rdquo; feature.<br/>
            Password sign-in is fine for everything else.
          </p>
        </div>
      </main>

      <footer className="border-t border-line bg-white py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-6 text-[11px] font-medium uppercase tracking-widest2 text-muted">
          Mining Summit CRM · internal · The Deep Dive
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
