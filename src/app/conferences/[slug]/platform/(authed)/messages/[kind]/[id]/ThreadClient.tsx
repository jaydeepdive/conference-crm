"use client";
/**
 * Conversation view + composer. Refreshes every 15s while the tab is visible
 * so replies appear without reloading.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalMessage } from "@/lib/messages";
import type { AttendeeSide } from "@/lib/types";

export function ThreadClient({ slug, otherId, mySide, blocked, timezone, messages }: {
  slug: string; otherId: string; mySide: AttendeeSide; blocked: boolean; timezone: string; messages: PortalMessage[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 15000);
    return () => clearInterval(t);
  }, [router]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/platform/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, other_lead_id: otherId, body }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(j.error ?? "Couldn't send. Try again."); return; }
    setText("");
    router.refresh();
  }

  const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="max-h-[60vh] min-h-[200px] space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No messages yet — say hello.</p>
        )}
        {messages.map(m => {
          const mine = m.sender_side === mySide;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine ? "text-black" : "bg-slate-100 text-slate-900"}`}
                style={mine ? { backgroundColor: "#ead9ae" } : undefined}>
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`mt-1 text-[11px] ${mine ? "text-stone-700" : "text-slate-500"}`}>
                  {mine ? "You" : (m.sender_name ?? "")}{m.sender_name || mine ? " · " : ""}{fmt(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-200 p-3">
        {blocked ? (
          <p className="text-sm text-slate-500">Messaging isn&rsquo;t available between you and this attendee.</p>
        ) : (
          <>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={4000}
              placeholder="Write a message…"
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
              className="w-full rounded-md border border-slate-300 px-3 py-2" style={{ fontSize: 16 }} />
            {error && <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">Everyone on your team and theirs can see this conversation.</span>
              <button onClick={send} disabled={busy || !text.trim()}
                className="shrink-0 rounded-md px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
                style={{ backgroundColor: "#c9a24b", minHeight: 44 }}>
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
