"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import type { CompType, ExpenseCategory } from "@/lib/types";

export function CompTypesManager({ conferenceId, compTypes }: { conferenceId: string; compTypes: CompType[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("0");
  const [category, setCategory] = useState<ExpenseCategory>("Other");

  async function add() {
    if (!name) return;
    const supabase = createClient();
    const { error } = await supabase.from("comp_types").insert({
      conference_id: conferenceId, name, default_cost: Number(cost), expense_category: category,
    });
    if (error) { alert(error.message); return; }
    setName(""); setCost("0"); setCategory("Other");
    router.refresh();
  }

  async function update(ct: CompType, field: keyof CompType, value: string | number) {
    const supabase = createClient();
    await supabase.from("comp_types").update({ [field]: value }).eq("id", ct.id);
    router.refresh();
  }

  async function remove(ct: CompType) {
    if (!confirm(`Delete "${ct.name}"? Existing comps using this type stay intact.`)) return;
    const supabase = createClient();
    await supabase.from("comp_types").delete().eq("id", ct.id);
    router.refresh();
  }

  const input = "rounded-md border border-gray-300 px-3 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Add comp type</h3>
        <p className="mt-1 text-xs text-gray-500">Predefined items you may comp to attendees (hotels, flights, golf rounds, etc.). When you assign a comp to a lead, its cost flows into the Budget.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <input className={`${input} sm:col-span-2`} placeholder="Name (e.g. Hotel - 2 nights)"
            value={name} onChange={e => setName(e.target.value)} />
          <input className={input} type="number" step="0.01" placeholder="Default cost $"
            value={cost} onChange={e => setCost(e.target.value)} />
          <select className={input} value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <button onClick={add} className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white">Add</button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Default cost</th>
              <th className="px-3 py-2">Expense category</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {compTypes.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">No comp types yet.</td></tr>
            )}
            {compTypes.map(ct => (
              <tr key={ct.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{ct.name}</td>
                <td className="px-3 py-2">
                  <input className={`${input} w-24`} type="number" step="0.01" defaultValue={ct.default_cost}
                    onBlur={e => {
                      const v = Number(e.target.value);
                      if (v !== Number(ct.default_cost)) update(ct, "default_cost", v);
                    }} />
                </td>
                <td className="px-3 py-2">
                  <select className={input} value={ct.expense_category}
                    onChange={e => update(ct, "expense_category", e.target.value)}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => remove(ct)} className="text-xs text-rose-600 hover:underline">delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
