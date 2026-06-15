"use client";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const TDD_LOGO = "https://thedeepdive.ca/wp-content/uploads/2025/04/thedeepdive_full.png";

function LoginForm() {
  const params = useSearchParams();
  const error = params.get("error");
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
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

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <div className="border-b border-ink/15">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-[10px] uppercase tracking-widest2 text-ink/70">
          <span className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-accent"></span>
            Mining Summit CRM · internal
          </span>
        </div>
      </div>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md border border-ink/20 bg-white p-10 text-center">
          <Image src={TDD_LOGO} alt="The Deep Dive" width={420} height={66}
            priority unoptimized className="mx-auto h-12 w-auto sm:h-14" />
          <h1 className="mt-4 font-serif text-2xl font-black uppercase tracking-tight text-ink">
            Mining Summit CRM
          </h1>
          <div className="my-4 mx-auto h-[6px] max-w-[200px] border-t-2 border-b border-ink"></div>
          <p className="text-xs uppercase tracking-widest2 text-ink/60">Sign in to manage leads, invoices, and tasks.</p>

          {error && (
            <div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800">
              Sign-in failed. Try again, or check that this email has been invited.
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-3 border border-ink/20 bg-white px-4 py-3 text-sm font-medium text-ink hover:border-brand-accent disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/></svg>
            {loading ? "Redirecting…" : "Sign in with Google"}
          </button>

          <p className="mt-6 text-xs text-ink/60">
            New here? Sign in once and an admin will approve your access. After that you&apos;ll see the CRM.
          </p>
        </div>
      </main>

      <footer className="border-t border-ink/15 bg-cream py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-6 text-[10px] uppercase tracking-widest2 text-ink/50">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-1 rounded-full bg-brand-accent"></span>
            The Deep Dive · internal tool
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
