"use client";
import { useEffect, useState } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";

type Audience = "company" | "investor" | "all";
const LABEL = "block text-[11px] font-medium uppercase tracking-widest2 text-muted";
const INPUT = "mt-1 w-full border border-ink/20 bg-white px-3 py-2.5 text-base text-ink focus:border-ink focus:outline-none md:text-sm";

export function EmailsClient({ slug }: { slug: string }) {
  const [audience, setAudience] = useState<Audience>("company");
  const [count, setCount] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [button, setButton] = useState(true);
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setCount(null);
    fetch("/api/platform/admin/broadcast", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, audience, preview: true }),
    }).then(r => r.json()).then(j => setCount(typeof j.count === "number" ? j.count : 0)).catch(() => setCount(0));
  }, [slug, audience]);

  const who = audience === "company" ? "registered companies" : audience === "investor" ? "registered investors" : "all registered attendees";

  async function send(test: boolean) {
    setMsg(null);
    const plain = body.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!subject.trim() || !plain) { setMsg({ ok: false, text: "Add a subject and a message first." }); return; }
    if (!test && !confirm(`Send "${subject.trim()}" to ${count} ${who}?\n\nThis can't be undone.`)) return;
    setBusy(test ? "test" : "send");
    const res = await fetch("/api/platform/admin/broadcast", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, audience, subject, body_html: body, include_button: button, test }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: j.error ?? "Sending failed." }); return; }
    setMsg({ ok: !(j.errors?.length), text: test
      ? "Test sent to your email — check your inbox (and junk folder)."
      : `Sent to ${j.sent} of ${j.total} ${who}.${j.errors?.length ? ` Some failed: ${j.errors.join("; ")}` : ""}` });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4 border border-line bg-white p-5">
        <div>
          <span className={LABEL}>Send to</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {([["company", "Companies"], ["investor", "Investors"], ["all", "Everyone"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setAudience(v)}
                className={`border px-3 py-2.5 text-xs font-semibold uppercase tracking-widest2 ${audience === v ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-ink"}`}>
                {l}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-muted">{count === null ? "Counting…" : `${count} ${who} with an email.`}</p>
        </div>
        <label className="block"><span className={LABEL}>Subject</span>
          <input className={INPUT} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Your 1-on-1 meeting portal is open" />
        </label>
        <div><span className={LABEL}>Message</span>
          <div className="mt-1">
            <RichTextEditor value={body} onChange={setBody}
              placeholder={"Write your message. Select text and use the toolbar to bold, resize or colour it.\nEach person is greeted by first name automatically."} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={button} onChange={e => setButton(e.target.checked)} />
          Include an &ldquo;Open the attendee portal&rdquo; button
        </label>
        {msg && <div className={`px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</div>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button onClick={() => send(true)} disabled={busy !== null}
            className="border border-ink/20 px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-ink disabled:opacity-50">
            {busy === "test" ? "Sending…" : "Send test to me"}
          </button>
          <button onClick={() => send(false)} disabled={busy !== null || !count}
            className="bg-brand-accent px-5 py-3 text-xs font-semibold uppercase tracking-widest2 text-white disabled:opacity-50">
            {busy === "send" ? "Sending…" : `Send to ${count ?? "…"} ${audience === "all" ? "people" : audience === "company" ? "company contacts" : "investors"}`}
          </button>
        </div>
      </div>
      <aside className="space-y-3 text-sm text-muted">
        <div className="border border-line bg-white p-4">
          <div className="font-display text-lg text-ink">Good to know</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            <li>Every contact at a company gets their own copy.</li>
            <li>Replies go to your email address.</li>
            <li>Resend&rsquo;s free plan allows about 100 emails a day across all sending — large sends may need splitting across days.</li>
            <li>Send yourself a test first to check how it looks.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
