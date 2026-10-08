"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import type { Expense, ExpenseCategory } from "@/lib/types";

export function BudgetClient({ conferenceId, expenses }: { conferenceId: string; expenses: Expense[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    category: "Venue" as ExpenseCategory, description: "", amount: "",
    date: new Date().toISOString().slice(0, 10), vendor: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addExpense() {
    if (!form.description || !form.amount) { setError("Description and amount are required"); return; }
    setAdding(true); setError(null);
    const supabase = createClient();

    let receipt_url: string | null = null;
    let receipt_path: string | null = null;

    if (file) {
      const path = `${conferenceId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file);
      if (upErr) { setError(`Upload failed: ${upErr.message}`); setAdding(false); return; }
      receipt_path = path;
      const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 60 * 24 * 365);
      receipt_url = signed?.signedUrl ?? null;
    }

    const { error: insErr } = await supabase.from("expenses").insert({
      conference_id: conferenceId,
      category: form.category,
      description: form.description,
      amount: Number(form.amount),
      date: form.date,
      vendor: form.vendor || null,
      receipt_url, receipt_path,
    });

    if (insErr) { setError(insErr.message); setAdding(false); return; }

    setForm({ category: "Venue", description: "", amount: "", date: new Date().toISOString().slice(0, 10), vendor: "" });
    setFile(null);
    router.refresh();
    setAdding(false);
  }

  async function deleteExpense(e: Expense) {
    if (!confirm(`Delete expense "${e.description}"?`)) return;
    const supabase = createClient();
    if (e.receipt_path) await supabase.storage.from("receipts").remove([e.receipt_path]);
    await supabase.from("expenses").delete().eq("id", e.id);
    router.refresh();
  }

  const usd = (n: number) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const input = "rounded-md border border-gray-300 px-3 py-1.5 text-sm";

  // Group by category for the breakdown
  const byCat = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((a, e) => a + Number(e.amount), 0),
    count: expenses.filter(e => e.category === cat).length,
  })).filter(x => x.count > 0);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Add expense</h3>
        {error && <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
        <div className="mt-3 grid gap-3 sm:grid-cols-6">
          <select className={`${input} sm:col-span-2`} value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <input className={`${input} sm:col-span-3`} placeholder="Description" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} />
          <input className={input} type="number" placeholder="$" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })} />
          <input className={`${input} sm:col-span-2`} placeholder="Vendor (optional)" value={form.vendor}
            onChange={e => setForm({ ...form, vendor: e.target.value })} />
          <input className={input} type="date" value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })} />
          <input className={`${input} sm:col-span-2 file:mr-3 file:rounded file:border-0 file:bg-brand-light file:px-2 file:py-1 file:text-xs file:text-brand`}
            type="file" accept="image/*,.pdf"
            onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <button onClick={addExpense} disabled={adding}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </section>

      {byCat.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">By category</h3>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {byCat.map(c => (
                <tr key={c.cat} className="border-t border-gray-100">
                  <td className="py-1.5">{c.cat}</td>
                  <td className="py-1.5 text-right text-xs text-gray-500">{c.count} item{c.count > 1 ? "s" : ""}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{usd(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">All expenses</h3>
        {expenses.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No expenses logged yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-1.5">Date</th><th className="py-1.5">Category</th>
              <th className="py-1.5">Description</th><th className="py-1.5">Vendor</th>
              <th className="py-1.5 text-right">Amount</th><th className="py-1.5">Receipt</th><th></th>
            </tr></thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="py-1.5">{e.date}</td>
                  <td className="py-1.5">{e.category}</td>
                  <td className="py-1.5">{e.description}</td>
                  <td className="py-1.5 text-xs text-gray-500">{e.vendor ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(e.amount)}</td>
                  <td className="py-1.5">
                    {e.receipt_url ? <a href={e.receipt_url} target="_blank" rel="noopener" className="text-brand hover:underline">view</a> : "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => deleteExpense(e)} className="text-xs text-rose-600 hover:underline">delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
