"use client";
import { useMemo, useState } from "react";
import { CompanyProfileEditor } from "@/components/CompanyProfileEditor";

export interface ProfileRow {
  id: string; name: string; website: string | null; about: string | null;
  category: string | null; primary_metal: string | null;
}

export function ProfilesClient({ rows }: { rows: ProfileRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const complete = (r: ProfileRow) => !!(r.category && r.about && r.website);
  const list = useMemo(() => rows.filter(r => !onlyIncomplete || !complete(r)), [rows, onlyIncomplete]);
  const doneCount = rows.filter(complete).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">{doneCount} of {rows.length} profiles complete</div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={onlyIncomplete} onChange={e => setOnlyIncomplete(e.target.checked)} />
          Show only incomplete
        </label>
      </div>
      <ul className="divide-y divide-line border border-line bg-white">
        {list.map(r => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-utility/60">
              <div className="min-w-0">
                <div className="font-semibold text-ink">{r.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                  {r.category ? <Tag>{r.category}</Tag> : <Missing>No category</Missing>}
                  {r.primary_metal ? <Tag>{r.primary_metal}</Tag> : <span className="text-muted">No metal</span>}
                  {!r.website && <Missing>No website</Missing>}
                  {!r.about && <Missing>No blurb</Missing>}
                </div>
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest2 text-brand-accent">{open === r.id ? "Close" : "Edit"}</span>
            </button>
            {open === r.id && (
              <div className="border-t border-line bg-utility/40 px-4 pb-4">
                <CompanyProfileEditor compact company={r} onSaved={() => setOpen(null)} />
              </div>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">All profiles are complete.</li>}
      </ul>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm border border-line px-1.5 py-px uppercase tracking-wider text-ink">{children}</span>;
}
function Missing({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm bg-amber-50 px-1.5 py-px font-semibold uppercase tracking-wider text-amber-900 ring-1 ring-inset ring-amber-300">{children}</span>;
}
