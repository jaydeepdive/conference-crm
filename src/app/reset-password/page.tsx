/**
 * /reset-password — staff CRM "choose a new password" screen.
 * Reached from the Supabase recovery email via /auth/callback?next=/reset-password,
 * which signs the user in; this page then sets the new password.
 */
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else setEmail(data.user.email ?? null);
    });
  }, [router]);

  async function save() {
    setError(null);
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-utility px-4">
      <div className="w-full max-w-sm border border-line bg-white p-6">
        <div className="text-[11px] font-medium uppercase tracking-widest2 text-muted">Reset password</div>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Choose a new password</h1>
        {email && <p className="mt-1 text-sm text-muted">{email}</p>}
        {error && <div className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
        <label className="mt-5 block text-[11px] font-medium uppercase tracking-widest2 text-muted">New password</label>
        <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)}
          className="mt-1 w-full border border-ink/20 px-3 py-3" style={{ fontSize: 16 }} />
        <label className="mt-4 block text-[11px] font-medium uppercase tracking-widest2 text-muted">Confirm</label>
        <input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); }}
          className="mt-1 w-full border border-ink/20 px-3 py-3" style={{ fontSize: 16 }} />
        <button onClick={save} disabled={busy}
          className="mt-6 w-full py-3 text-xs font-semibold uppercase tracking-widest2 text-white disabled:opacity-50"
          style={{ backgroundColor: "#C8102E" }}>
          {busy ? "Saving…" : "Save & sign in"}
        </button>
      </div>
    </div>
  );
}
