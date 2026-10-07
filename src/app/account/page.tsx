/**
 * /account — staff CRM account settings. Change your own password while
 * signed in (no email involved).
 */
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_VERSION } from "@/lib/version";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else setEmail(data.user.email ?? null);
    });
  }, [router]);

  async function save() {
    setError(null); setDone(false);
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setPw(""); setPw2(""); setDone(true);
  }

  return (
    <div className="min-h-screen bg-utility">
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 text-[11px] font-medium uppercase tracking-widest2 text-muted sm:px-6">
          <Link href="/conferences" className="hover:text-ink">← Back to CRM</Link>
          <span>{APP_VERSION}</span>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="text-[11px] font-medium uppercase tracking-widest2 text-muted">Account settings</div>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">Your account</h1>
        {email && <p className="mt-1 text-sm text-muted">Signed in as <strong className="text-ink">{email}</strong></p>}

        <div className="mt-6 max-w-md border border-line bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest2 text-ink">Change password</h2>
          {error && <div className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
          {done && <div className="mt-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Password updated. Use it next time you sign in.</div>}
          <label className="mt-4 block text-[11px] font-medium uppercase tracking-widest2 text-muted">New password</label>
          <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)}
            className="mt-1 w-full border border-ink/20 px-3 py-3" style={{ fontSize: 16 }} />
          <label className="mt-4 block text-[11px] font-medium uppercase tracking-widest2 text-muted">Confirm new password</label>
          <input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); }}
            className="mt-1 w-full border border-ink/20 px-3 py-3" style={{ fontSize: 16 }} />
          <button onClick={save} disabled={busy}
            className="mt-5 w-full py-3 text-xs font-semibold uppercase tracking-widest2 text-white disabled:opacity-50"
            style={{ backgroundColor: "#C8102E" }}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </div>
      </div>
    </div>
  );
}
