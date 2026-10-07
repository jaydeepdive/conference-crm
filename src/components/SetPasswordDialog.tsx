"use client";
/**
 * Set-password dialog for super admins. Works for attendees (portal logins)
 * and staff CRM users — the caller passes the API endpoint + body.
 *
 * Flow: open → choose "Generate" (default) or type your own → Set password →
 * the new password is shown large so it can be read aloud at the desk, with
 * a Copy button. Bottom sheet on phones, centered card on desktop.
 */
import { useState } from "react";

export function SetPasswordDialog({
  open, onClose, who, email, endpoint, body,
}: {
  open: boolean;
  onClose: () => void;
  who: string;
  email: string;
  endpoint: string;
  body?: Record<string, unknown>;
}) {
  const [mode, setMode] = useState<"generate" | "custom">("generate");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  function close() {
    setMode("generate"); setCustom(""); setError(null); setResult(null); setCopied(false);
    onClose();
  }

  async function submit() {
    setError(null);
    if (mode === "custom" && custom.trim().length < 8) {
      setError("Password must be at least 8 characters."); return;
    }
    setBusy(true);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(body ?? {}), ...(mode === "custom" ? { password: custom.trim() } : {}) }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(j.error ?? "Could not set password."); return; }
    setResult(j.password as string);
  }

  async function copy() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result); setCopied(true); } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={close}>
      <div
        className="w-full max-w-md rounded-t-lg border border-line bg-white p-5 shadow-xl sm:rounded-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-[11px] font-medium uppercase tracking-widest2 text-muted">Set password</div>
        <div className="mt-1 font-display text-2xl font-bold text-ink">{who}</div>
        <div className="text-sm text-muted">{email}</div>

        {!result ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {(["generate", "custom"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`whitespace-nowrap border px-3 py-2.5 text-xs font-semibold uppercase tracking-widest2 ${
                    mode === m ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-ink"}`}>
                  {m === "generate" ? "Generate one" : "Type my own"}
                </button>
              ))}
            </div>

            {mode === "custom" && (
              <input
                autoFocus
                value={custom}
                onChange={e => setCustom(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-3 w-full border border-ink/20 px-3 py-3 text-base"
                style={{ fontSize: 16 }}
              />
            )}

            <p className="mt-3 text-xs text-muted">
              Takes effect immediately. No email is sent — share it in person.
              {mode === "generate" && " You'll get an easy-to-read password like Copper-4827-Mesa."}
            </p>

            {error && <div className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

            <div className="mt-5 flex gap-2">
              <button onClick={submit} disabled={busy}
                className="flex-1 whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-white disabled:opacity-50"
                style={{ backgroundColor: "#C8102E" }}>
                {busy ? "Setting…" : "Set password"}
              </button>
              <button onClick={close}
                className="whitespace-nowrap border border-ink/20 px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-ink">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
              <div className="text-[11px] uppercase tracking-widest2 text-emerald-800">New password</div>
              <div className="mt-2 select-all break-all font-mono text-2xl font-semibold text-ink">{result}</div>
            </div>
            <p className="mt-3 text-xs text-muted">
              This is the only time it&rsquo;s shown. They sign in with <strong>{email}</strong> and this password,
              and can change it later from their settings.
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={copy}
                className="flex-1 whitespace-nowrap border border-ink/20 px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-ink">
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button onClick={close}
                className="flex-1 whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-white"
                style={{ backgroundColor: "#0E0E0E" }}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
