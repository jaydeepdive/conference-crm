"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Conference, Entity, ConferenceEntity, ConfStatus } from "@/lib/types";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function ConferencesAdmin({ conferences, entities, links }: {
  conferences: Conference[]; entities: Entity[]; links: ConferenceEntity[];
}) {
  const router = useRouter();
  const [name, setName] = useState(""); const [slug, setSlug] = useState("");
  const [dateStart, setDateStart] = useState(""); const [dateEnd, setDateEnd] = useState("");

  async function createConference() {
    if (!name) return;
    const supabase = createClient();
    const finalSlug = slug || slugify(name);
    const { error } = await supabase.from("conferences").insert({
      name, slug: finalSlug, date_start: dateStart || null, date_end: dateEnd || null, status: "planning",
    });
    if (error) { alert(error.message); return; }
    setName(""); setSlug(""); setDateStart(""); setDateEnd("");
    router.refresh();
  }

  const input = "rounded-md border border-gray-300 px-3 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">New conference</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <input className={`${input} sm:col-span-2`} placeholder="Name (e.g. Mining Summit 2027)"
            value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} />
          <input className={`${input} sm:col-span-1`} placeholder="slug" value={slug} onChange={e => setSlug(slugify(e.target.value))} />
          <input className={input} type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
          <input className={input} type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
          <button onClick={createConference} className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white sm:col-span-5 sm:max-w-fit">Create</button>
        </div>
      </section>

      <div className="space-y-4">
        {conferences.map(c => (
          <ConferenceRow key={c.id} conference={c} entities={entities}
            links={links.filter(l => l.conference_id === c.id)} />
        ))}
      </div>
    </div>
  );
}

function ConferenceRow({ conference, entities, links }: {
  conference: Conference; entities: Entity[]; links: ConferenceEntity[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(conference.status);

  async function setStatusOnServer(s: ConfStatus) {
    const supabase = createClient();
    await supabase.from("conferences").update({ status: s }).eq("id", conference.id);
    setStatus(s);
    router.refresh();
  }

  async function addEntity(entityId: string, pct: number) {
    const supabase = createClient();
    await supabase.from("conference_entities").upsert({
      conference_id: conference.id, entity_id: entityId, split_percentage: pct,
    }, { onConflict: "conference_id,entity_id" });
    router.refresh();
  }

  async function removeEntity(linkId: string) {
    const supabase = createClient();
    await supabase.from("conference_entities").delete().eq("id", linkId);
    router.refresh();
  }

  const totalSplit = links.reduce((a, l) => a + Number(l.split_percentage), 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{conference.name}</h3>
          <p className="text-xs text-gray-500">
            /{conference.slug} · {conference.date_start ?? "no start date"}
            {conference.date_end && conference.date_end !== conference.date_start ? ` → ${conference.date_end}` : ""}
          </p>
        </div>
        <select value={status} onChange={e => setStatusOnServer(e.target.value as ConfStatus)}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs">
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="past">Past</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">JV split</h4>
        {links.length === 0 && <p className="mt-2 text-xs text-gray-500">No entities linked yet.</p>}
        <table className="mt-2 w-full text-sm">
          <tbody>
            {links.map(l => {
              const ent = entities.find(e => e.id === l.entity_id);
              return (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="py-1.5">{ent?.name ?? "Unknown"}</td>
                  <td className="py-1.5 text-right tabular-nums">{Number(l.split_percentage).toFixed(1)}%</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => removeEntity(l.id)} className="text-xs text-rose-600 hover:underline">remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totalSplit !== 0 && totalSplit !== 100 && (
          <p className="mt-1 text-xs text-amber-700">Splits add up to {totalSplit.toFixed(1)}% — should be 100% for accurate JV calc.</p>
        )}
        <AddSplit conferenceId={conference.id} entities={entities} existing={links} onAdd={addEntity} />
      </div>
    </div>
  );
}

function AddSplit({ entities, existing, onAdd }: {
  conferenceId: string; entities: Entity[]; existing: ConferenceEntity[];
  onAdd: (eid: string, pct: number) => Promise<void>;
}) {
  const [entityId, setEntityId] = useState("");
  const [pct, setPct] = useState("");
  const available = entities.filter(e => !existing.some(l => l.entity_id === e.id));

  async function submit() {
    if (!entityId || !pct) return;
    await onAdd(entityId, Number(pct));
    setEntityId(""); setPct("");
  }

  if (available.length === 0) return <p className="mt-2 text-xs text-gray-400">All entities are already linked. Create more in the Entities tab.</p>;

  return (
    <div className="mt-3 flex items-center gap-2">
      <select value={entityId} onChange={e => setEntityId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
        <option value="">— pick entity —</option>
        {available.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <input value={pct} onChange={e => setPct(e.target.value)} type="number" placeholder="split %" className="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs" />
      <button onClick={submit} className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white">Add</button>
    </div>
  );
}
