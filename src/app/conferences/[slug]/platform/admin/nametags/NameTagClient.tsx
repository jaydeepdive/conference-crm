"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export interface TagPreset { type: "company" | "investor" | "guest"; name: string; org: string }
type Kind = TagPreset["type"];

const LABEL = "block text-[11px] font-medium uppercase tracking-widest2 text-muted";
const INPUT = "mt-1 w-full border border-ink/20 bg-white px-3 py-2 text-base text-ink focus:border-ink focus:outline-none md:text-sm";

/** Shrink a line until it fits the tag width (mm → px at 96dpi). */
function useFit(text: string, max: number, min: number, widthMm: number, weight: number) {
  const [size, setSize] = useState(max);
  useEffect(() => {
    const c = document.createElement("canvas").getContext("2d"); if (!c) return;
    const w = (widthMm / 25.4) * 96;
    let s = max;
    while (s > min) { c.font = `${weight} ${s}px Arial, Helvetica, sans-serif`; if (c.measureText(text).width <= w) break; s -= 0.5; }
    setSize(s);
  }, [text, max, min, widthMm, weight]);
  return size;
}

export function NameTagClient({ presets }: { presets: TagPreset[] }) {
  const [kind, setKind] = useState<Kind>("company");
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState("Guest");
  const [q, setQ] = useState("");
  const tagRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase(); if (!n) return [];
    return presets.filter(p => p.name.toLowerCase().includes(n) || p.org.toLowerCase().includes(n)).slice(0, 8);
  }, [presets, q]);

  const line2 = kind === "company" ? org : kind === "investor" ? "INVESTOR" : role.toUpperCase();
  const line3 = kind === "investor" ? org : kind === "guest" ? org : "";
  const nameSize = useFit(name || "Full Name", 34, 18, 90, 700);
  const l2Size = useFit(line2 || "Company", kind === "company" ? 19 : 18, 10, 90, kind === "company" ? 400 : 700);
  const l3Size = useFit(line3, 15, 8, 90, 400);

  function pick(p: TagPreset) { setKind(p.type); setName(p.name); setOrg(p.org); setQ(""); }

  const tab = (v: Kind, label: string) => (
    <button type="button" onClick={() => setKind(v)}
      className={`border px-3 py-2 text-[11px] font-semibold uppercase tracking-widest2 ${kind === v ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-muted"}`}>{label}</button>
  );

  return (
    <div className="nt-grid grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <style>{`
        @media print {
          @page { size: 100mm 62mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important;
                       width: 100mm !important; height: 62mm !important; overflow: hidden !important; }
          .ab-admin { min-height: 0 !important; display: block !important; }
          .ab-admin > header, .nt-hide { display: none !important; }
          .ab-admin > main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
          .nt-grid, .nt-preview, .nt-page { display: block !important; margin: 0 !important; padding: 0 !important; gap: 0 !important; }
          #nametag { margin: 0 !important; height: 61.5mm !important; border: 0 !important; box-shadow: none !important; overflow: hidden !important;
                     page-break-after: avoid; page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      <div className="nt-hide space-y-4">
        <div className="relative">
          <label className={LABEL}>Find a registered attendee (optional)</label>
          <input className={INPUT} value={q} onChange={e => setQ(e.target.value)} placeholder="Type a name or company…" />
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full divide-y divide-line border border-line bg-white shadow-lg">
              {matches.map((p, i) => (
                <li key={i}><button type="button" onClick={() => pick(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-utility">
                  <span className="font-semibold text-ink">{p.name}</span>
                  <span className="text-muted"> · {p.type === "company" ? p.org : `Investor${p.org ? ` · ${p.org}` : ""}`}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <span className={LABEL}>Template</span>
          <div className="mt-1 flex flex-wrap gap-2">{tab("company", "Company")}{tab("investor", "Investor")}{tab("guest", "Guest / Staff / Speaker")}</div>
        </div>

        <label className="block"><span className={LABEL}>Full name</span>
          <input className={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" /></label>

        {kind === "guest" && (
          <label className="block"><span className={LABEL}>Role (shown in capitals)</span>
            <input className={INPUT} value={role} onChange={e => setRole(e.target.value)} placeholder="Guest, Staff, Speaker, Media…" /></label>
        )}

        <label className="block"><span className={LABEL}>{kind === "company" ? "Company" : "Company / firm (optional)"}</span>
          <input className={INPUT} value={org} onChange={e => setOrg(e.target.value)} placeholder={kind === "company" ? "Alex Metals" : "Piggo's Trading Desk"} /></label>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={() => window.print()} disabled={!name.trim()}
            className="bg-brand-accent px-5 py-3 text-xs font-semibold uppercase tracking-widest2 text-white disabled:opacity-40">Print tag</button>
          <button type="button" onClick={() => { setName(""); setOrg(""); setRole("Guest"); }} className="text-sm underline text-muted">Clear</button>
        </div>
        <p className="text-xs text-muted">
          In the print dialog choose the Brother QL-820NWBc and paper size <strong>62 mm × 100 mm</strong> (landscape), margins none, scale 100%.
        </p>
      </div>

      <div className="nt-preview">
        <span className={`nt-hide ${LABEL}`}>Preview (actual size)</span>
        <div ref={tagRef} id="nametag" className="mt-1 flex flex-col items-center justify-center bg-white text-center shadow"
          style={{ width: "100mm", height: "62mm", padding: "5mm", border: "1px dashed #c9c2b2", fontFamily: "Arial, Helvetica, sans-serif", color: "#000", boxSizing: "border-box" }}>
          <div style={{ fontWeight: 700, fontSize: nameSize, lineHeight: 1.1 }}>{name || <span style={{ color: "#bbb" }}>Full Name</span>}</div>
          {line2 && <div style={{ marginTop: "3mm", fontWeight: kind === "company" ? 400 : 700, fontSize: l2Size, letterSpacing: kind === "company" ? 0 : "0.04em" }}>{line2}</div>}
          {line3 && <div style={{ marginTop: "1mm", fontSize: l3Size }}>{line3}</div>}
        </div>
      </div>
    </div>
  );
}
