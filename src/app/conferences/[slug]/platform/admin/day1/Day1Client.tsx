"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface Day1Activity { kind: "site_visit" | "golf"; title: string; when_text: string | null; location: string | null; details: string | null }
export interface Day1Person {
  id: string; name: string | null; email: string | null; phone: string | null;
  side: "company" | "investor"; org: string; activity: "site_visit" | "golf" | "none" | null;
}

const LABEL = "block text-[11px] font-medium uppercase tracking-widest2 text-muted";
const INPUT = "mt-1 w-full border border-ink/20 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none";
const OPTS: { v: Day1Person["activity"]; label: string }[] = [
  { v: null, label: "Undecided" }, { v: "site_visit", label: "Site visit" }, { v: "golf", label: "Golf" }, { v: "none", label: "Neither" },
];

export function Day1Client({ conferenceId, activities, people }: {
  conferenceId: string; activities: Day1Activity[]; people: Day1Person[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "site_visit" | "golf" | "none" | "undecided">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const counts = useMemo(() => ({
    site_visit: people.filter(p => p.activity === "site_visit").length,
    golf: people.filter(p => p.activity === "golf").length,
    none: people.filter(p => p.activity === "none").length,
    undecided: people.filter(p => !p.activity).length,
  }), [people]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return people.filter(p =>
      (filter === "all" || (filter === "undecided" ? !p.activity : p.activity === filter)) &&
      (!n || (p.name ?? "").toLowerCase().includes(n) || p.org.toLowerCase().includes(n) || (p.email ?? "").toLowerCase().includes(n)));
  }, [people, filter, q]);

  async function assign(ids: string[], activity: Day1Person["activity"]) {
    setBusy(ids.join(",")); setErr(null);
    const res = await fetch("/api/platform/admin/day1", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", ids, activity }),
    });
    setBusy(null);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Could not save."); return; }
    router.refresh();
  }

  function csv(kind: "site_visit" | "golf") {
    const rows = people.filter(p => p.activity === kind);
    const esc = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const text = ["Name,Organization,Type,Email,Phone", ...rows.map(p => [p.name, p.org, p.side, p.email, p.phone].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = kind === "golf" ? "day1-golf.csv" : "day1-site-visit.csv";
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {(["site_visit", "golf"] as const).map(kind => (
          <ActivityEditor key={kind} conferenceId={conferenceId} kind={kind}
            initial={activities.find(a => a.kind === kind)} count={counts[kind]} onCsv={() => csv(kind)} />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or organization"
            className="w-full border border-ink/20 bg-white px-3 py-2 text-base md:text-sm lg:max-w-sm" />
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
            {([["all", `All (${people.length})`], ["site_visit", `Site visit (${counts.site_visit})`], ["golf", `Golf (${counts.golf})`],
              ["none", `Neither (${counts.none})`], ["undecided", `Undecided (${counts.undecided})`]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`shrink-0 whitespace-nowrap border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest2 ${filter === v ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-muted"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {err && <div className="bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>}
        <ul className="divide-y divide-line border border-line bg-white">
          {list.map(p => (
            <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-ink">{p.name ?? <span className="italic text-muted">No name</span>}</div>
                <div className="text-xs text-muted">{p.org} · {p.side === "company" ? "Company" : "Investor"}{p.email ? ` · ${p.email}` : ""}</div>
              </div>
              <div className="grid grid-cols-4 gap-1 sm:flex">
                {OPTS.map(o => (
                  <button key={String(o.v)} disabled={busy !== null} onClick={() => p.activity !== o.v && assign([p.id], o.v)}
                    className={`whitespace-nowrap border px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider disabled:opacity-60 ${
                      p.activity === o.v ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-ink hover:border-ink"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
          {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No one matches.</li>}
        </ul>
      </div>
    </div>
  );
}

function ActivityEditor({ conferenceId, kind, initial, count, onCsv }: {
  conferenceId: string; kind: "site_visit" | "golf"; initial?: Day1Activity; count: number; onCsv: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? (kind === "golf" ? "Golf tournament" : "Site visit"));
  const [when, setWhen] = useState(initial?.when_text ?? "");
  const [loc, setLoc] = useState(initial?.location ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/platform/admin/day1", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "details", conference_id: conferenceId, kind, title, when_text: when, location: loc, details }),
    });
    setBusy(false);
    setMsg(res.ok ? "Saved — attendees assigned to this see it on their Schedule." : "Could not save.");
    if (res.ok) router.refresh();
  }

  return (
    <div className="border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-2xl">{kind === "golf" ? "⛳ Golf" : "⛏ Site visit"}</div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{count} assigned</span>
          {count > 0 && <button onClick={onCsv} className="border border-ink/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink">Download list</button>}
        </div>
      </div>
      <label className="mt-3 block"><span className={LABEL}>Title</span><input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="mt-3 block"><span className={LABEL}>When</span><input className={INPUT} value={when} onChange={e => setWhen(e.target.value)} placeholder="Sunday, Nov 22 · Shuttle departs 7:30 AM from the Andaz lobby" /></label>
      <label className="mt-3 block"><span className={LABEL}>Where / meeting point</span><input className={INPUT} value={loc} onChange={e => setLoc(e.target.value)} placeholder="Address or meeting point" /></label>
      <label className="mt-3 block"><span className={LABEL}>Details for attendees</span>
        <textarea className={`${INPUT} min-h-[120px]`} value={details} onChange={e => setDetails(e.target.value)}
          placeholder={kind === "golf" ? "Format, tee time, club rentals, dress code, what's included…" : "Itinerary, what to wear/bring (closed-toe shoes, ID), return time…"} />
      </label>
      {msg && <div className="mt-2 text-sm text-muted">{msg}</div>}
      <div className="mt-3 flex justify-end">
        <button onClick={save} disabled={busy} className="bg-brand-accent px-4 py-2.5 text-xs font-semibold uppercase tracking-widest2 text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save details"}
        </button>
      </div>
    </div>
  );
}
