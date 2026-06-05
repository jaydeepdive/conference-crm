"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Entity } from "@/lib/types";

export function EntitiesAdmin({ entities }: { entities: Entity[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  async function add() {
    if (!name) return;
    const supabase = createClient();
    await supabase.from("entities").insert({ name, notes: notes || null });
    setName(""); setNotes("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this entity? Any conference splits using it will also be removed.")) return;
    const supabase = createClient();
    await supabase.from("entities").delete().eq("id", id);
    router.refresh();
  }

  const input = "rounded-md border border-gray-300 px-3 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">New entity</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <input className={`${input} sm:col-span-2`} placeholder="Name (e.g. Deep Dive Capital)"
            value={name} onChange={e => setName(e.target.value)} />
          <input className={`${input} sm:col-span-2`} placeholder="Notes (optional)"
            value={notes} onChange={e => setNotes(e.target.value)} />
          <button onClick={add} className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white">Add</button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Notes</th><th className="px-3 py-2">Created</th><th></th></tr>
          </thead>
          <tbody>
            {entities.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">No entities yet.</td></tr>}
            {entities.map(e => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{e.name}</td>
                <td className="px-3 py-2 text-gray-600">{e.notes ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(e.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right"><button onClick={() => remove(e.id)} className="text-xs text-rose-600 hover:underline">delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
