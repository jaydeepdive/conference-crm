"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface TyRow { side: "company" | "investor"; org: string; name: string; email: string; count: number; subject: string; html: string; sent: boolean }

export function ThankYouClient({ slug, rows }: { slug: string; rows: TyRow[] }) {
  const router = useRouter();
  const [side, setSide] = useState<"company" | "investor">("company");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const list = useMemo(() => rows.filter(r => r.side === side), [rows, side]);
  const unsent = list.filter(r => !r.sent).length;

  async function call(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/platform/admin/thankyou", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, side, ...body }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    return { ok: res.ok, j };
  }
  async function test(email?: string) {
    const { ok, j } = await call({ action: "test", email });
    setMsg(ok ? `Test sent to ${j.sent_to} (showing ${j.sample_for}'s email).` : (j.error ?? "Could not send the test."));
  }
  async function sendAll() {
    if (!confirm(`Send the thank-you email to ${unsent} ${side === "company" ? "company contacts" : "investors"}? This can't be undone.`)) return;
    const { ok, j } = await call({ action: "send" });
    setMsg(ok ? `Sent ${j.sent} email${j.sent === 1 ? "" : "s"}.${j.note ? " " + j.note : ""}` : `Sent ${j.sent ?? 0} of ${j.total ?? "?"}. Problems: ${(j.errors ?? [j.error]).join(" | ")}`);
    router.refresh();
  }
  const tab = (v: "company" | "investor", label: string) => (
    <button type="button" onClick={() => { setSide(v); setOpen(null); setMsg(null); }}
      className={`border px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 ${side === v ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-muted"}`}>{label}</button>
  );
  const btn = "border border-ink/20 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-ink hover:border-ink disabled:opacity-40";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tab("company", `Companies (${rows.filter(r => r.side === "company").length})`)}
        {tab("investor", `Investors (${rows.filter(r => r.side === "investor").length})`)}
      </div>
      <div className="flex flex-col gap-2 border border-line bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted">{unsent} not sent yet · {list.length - unsent} sent · from no-reply@abovebeyondsummit.com, replies to you</div>
        <div className="flex gap-2">
          <button type="button" onClick={() => test()} disabled={busy || list.length === 0} className={btn}>Send test to me</button>
          <button type="button" onClick={sendAll} disabled={busy || unsent === 0}
            className="bg-brand-accent px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-white disabled:opacity-40">
            {busy ? "Working…" : `Send to ${unsent} ${side === "company" ? "companies" : "investors"}`}
          </button>
        </div>
      </div>
      {msg && <div className="border border-line bg-utility px-3 py-2 text-sm text-ink">{msg}</div>}
      <ul className="divide-y divide-line border border-line bg-white">
        {list.map(r => (
          <li key={r.email} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">{side === "company" ? r.org : r.name}{side === "company" && r.name ? <span className="font-normal text-muted"> · {r.name}</span> : null}</div>
                <div className="truncate text-xs text-muted">{r.email} · {r.count} {side === "company" ? "investor" : "compan"}{side === "company" ? (r.count === 1 ? "" : "s") : (r.count === 1 ? "y" : "ies")}{side === "investor" && r.org ? ` · ${r.org}` : ""}</div>
              </div>
              {r.sent ? <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Sent</span>
                : <span className="text-[11px] uppercase tracking-wider text-muted">Not sent</span>}
              <button type="button" className={btn} onClick={() => setOpen(open === r.email ? null : r.email)}>{open === r.email ? "Hide" : "Preview"}</button>
              <button type="button" className={btn} disabled={busy} onClick={() => test(r.email)}>Test</button>
            </div>
            {open === r.email && (
              <iframe title={`Preview for ${r.email}`} srcDoc={r.html} className="mt-3 w-full border border-line" style={{ height: 720 }} />
            )}
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nobody on this list.</li>}
      </ul>
    </div>
  );
}
