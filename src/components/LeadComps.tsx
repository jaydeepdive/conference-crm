"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LeadComp, CompType, LeadType } from "@/lib/types";

export function LeadComps({ comps, compTypes, leadType, leadId, conferenceId, currentUserId, canEdit }: {
  comps: LeadComp[];
  compTypes: CompType[];
  leadType: LeadType;
  leadId: string;
  conferenceId: string;
  currentUserId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [compTypeId, setCompTypeId] = useState("");
  const [costOverride, setCostOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function addComp() {
    if (!compTypeId) return;
    const ct = compTypes.find(c => c.id === compTypeId);
    if (!ct) return;
    setSaving(true);
    const supabase = createClient();
    const cost = costOverride !== "" ? Number(costOverride) : ct.default_cost;
    const { error } = await supabase.from("lead_comps").insert({
      conference_id: conferenceId, lead_type: leadType, lead_id: leadId,
      comp_type_id: ct.id, name: ct.name, cost, expense_category: ct.expense_category,
      notes: notes || null, created_by: currentUserId,
    });
    if (error) { alert(error.message); setSaving(false); return; }
    setCompTypeId(""); setCostOverride(""); setNotes("");
    router.refresh();
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this comp?")) return;
    const supabase = createClient();
    await supabase.from("lead_comps").delete().eq("id", id);
    router.refresh();
  }

  const total = comps.reduce((a, c) => a + Number(c.cost), 0);
  const usd = (n: number) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const input = "rounded-md border border-gray-300 px-3 py-1.5 text-sm";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Comps</h3>
        <span className="text-sm font-semibold text-gray-900">{usd(total)} total</span>
      </div>

      <ul className="mt-3 space-y-2">
        {comps.length === 0 && <li className="text-sm text-gray-500">No comps assigned yet.</li>}
        {comps.map(c => (
          <li key={c.id} className="flex items-baseline justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 p-2 text-sm">
            <div className="flex-1">
              <div className="font-medium">{c.name}</div>
              {c.notes && <div className="text-xs text-gray-500">{c.notes}</div>}
              <div className="text-xs text-gray-400">{c.expense_category}</div>
            </div>
            <div className="tabular-nums">{usd(c.cost)}</div>
            {canEdit && <button onClick={() => remove(c.id)} className="text-xs text-rose-600 hover:underline">remove</button>}
          </li>
        ))}
      </ul>

      {canEdit && compTypes.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add comp</h4>
          <div className="mt-2 space-y-2">
            <select className={`${input} w-full`} value={compTypeId} onChange={e => setCompTypeId(e.target.value)}>
              <option value="">— pick from catalog —</option>
              {compTypes.map(ct => (
                <option key={ct.id} value={ct.id}>{ct.name} (${ct.default_cost.toLocaleString()})</option>
              ))}
            </select>
            <input className={`${input} w-full`} type="number" step="0.01"
              placeholder="Cost (defaults to catalog price)"
              value={costOverride} onChange={e => setCostOverride(e.target.value)} />
            <input className={`${input} w-full`} placeholder="Notes (optional)"
              value={notes} onChange={e => setNotes(e.target.value)} />
            <button onClick={addComp} disabled={saving || !compTypeId}
              className="w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Adding…" : "Add comp"}
            </button>
          </div>
        </div>
      )}

      {canEdit && compTypes.length === 0 && (
        <p className="mt-3 text-xs text-amber-700">No comp types defined yet. A conference admin can add them in <strong>Settings</strong>.</p>
      )}
    </div>
  );
}
