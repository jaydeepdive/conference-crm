"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FEE_TYPES, FEE_BASES } from "@/lib/constants";
import { feeTermsLabel } from "@/lib/fees";
import type { Conference, Entity, ConferenceEntity, ConfStatus, FeeType, FeeBasis, DiscountType } from "@/lib/types";

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
          <ConferenceCard key={c.id} conference={c} entities={entities}
            links={links.filter(l => l.conference_id === c.id)} />
        ))}
      </div>
    </div>
  );
}

function ConferenceCard({ conference, entities, links }: {
  conference: Conference; entities: Entity[]; links: ConferenceEntity[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: conference.name, slug: conference.slug,
    date_start: conference.date_start ?? "", date_end: conference.date_end ?? "",
    status: conference.status, notes: conference.notes ?? "",
    client_discount_type: conference.client_discount_type as DiscountType,
    client_discount_value: conference.client_discount_value,
    client_discount_label: conference.client_discount_label,
  });

  async function saveConference() {
    const supabase = createClient();
    const { error } = await supabase.from("conferences").update({
      name: form.name, slug: form.slug,
      date_start: form.date_start || null, date_end: form.date_end || null,
      status: form.status, notes: form.notes || null,
      client_discount_type: form.client_discount_type,
      client_discount_value: Number(form.client_discount_value),
      client_discount_label: form.client_discount_label || "Client discount",
    }).eq("id", conference.id);
    if (error) { alert(error.message); return; }
    setEditing(false);
    router.refresh();
  }

  async function deleteConference() {
    if (!confirm(`Delete "${conference.name}" and ALL its data (leads, expenses, etc.)? This cannot be undone.`)) return;
    const supabase = createClient();
    await supabase.from("conferences").delete().eq("id", conference.id);
    router.refresh();
  }

  const input = "rounded-md border border-gray-300 px-3 py-1.5 text-sm";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={`${input} sm:col-span-2`} placeholder="Name"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className={input} placeholder="slug"
            value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
          <input className={input} type="date" value={form.date_start} onChange={e => setForm({ ...form, date_start: e.target.value })} />
          <input className={input} type="date" value={form.date_end} onChange={e => setForm({ ...form, date_end: e.target.value })} />
          <select className={input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as ConfStatus })}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="past">Past</option>
            <option value="archived">Archived</option>
          </select>
          <textarea className={`${input} sm:col-span-3 min-h-[60px]`} placeholder="Notes (optional)"
            value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

          <div className="sm:col-span-3 border-t border-gray-200 pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Client discount (auto-applied to TDD clients on invoice)</div>
          </div>
          <div className="sm:col-span-2"><label className="block text-xs text-gray-500">Label on invoice</label>
            <input className={input} placeholder="e.g. TDD Client Discount"
              value={form.client_discount_label} onChange={e => setForm({ ...form, client_discount_label: e.target.value })} /></div>
          <div><label className="block text-xs text-gray-500">Type</label>
            <select className={input} value={form.client_discount_type}
              onChange={e => setForm({ ...form, client_discount_type: e.target.value as DiscountType })}>
              <option value="percent">Percent (%)</option>
              <option value="fixed">Fixed ($)</option>
            </select></div>
          <div><label className="block text-xs text-gray-500">Value</label>
            <input className={input} type="number" step="0.01"
              value={form.client_discount_value} onChange={e => setForm({ ...form, client_discount_value: Number(e.target.value) })} /></div>

          <div className="sm:col-span-3 flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
            <button onClick={saveConference} className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white">Save</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{conference.name}</h3>
            <p className="text-xs text-gray-500">
              /{conference.slug} · {conference.date_start ?? "no start date"}
              {conference.date_end && conference.date_end !== conference.date_start ? ` → ${conference.date_end}` : ""}
              {" · "}{conference.status}
            </p>
            {conference.notes && <p className="mt-1 text-sm text-gray-600">{conference.notes}</p>}
            <p className="mt-1 text-xs text-gray-500">
              Client discount: {conference.client_discount_value > 0
                ? `${conference.client_discount_type === "percent" ? `${conference.client_discount_value}%` : `$${conference.client_discount_value}`} · "${conference.client_discount_label}"`
                : "none"}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="text-sm text-brand hover:underline">Edit</button>
            <button onClick={deleteConference} className="text-sm text-rose-600 hover:underline">Delete</button>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-gray-200 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">JV split + management fees</h4>
        {links.length === 0 && <p className="mt-2 text-xs text-gray-500">No entities linked yet.</p>}
        <div className="mt-2 space-y-2">
          {links.map(l => {
            const ent = entities.find(e => e.id === l.entity_id);
            return <SplitRow key={l.id} link={l} entityName={ent?.name ?? "Unknown"} />;
          })}
        </div>
        <AddSplit conferenceId={conference.id} entities={entities} existing={links} />
      </div>
    </div>
  );
}

function SplitRow({ link, entityName }: { link: ConferenceEntity; entityName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    split_percentage: link.split_percentage,
    fee_label: link.fee_label ?? "",
    fee_type: link.fee_type as FeeType,
    fee_amount: link.fee_amount,
    fee_basis: link.fee_basis as FeeBasis,
    fee_min: link.fee_min ?? "",
    fee_max: link.fee_max ?? "",
  });

  async function save() {
    const supabase = createClient();
    const { error } = await supabase.from("conference_entities").update({
      split_percentage: Number(form.split_percentage),
      fee_label: form.fee_label || null,
      fee_type: form.fee_type,
      fee_amount: Number(form.fee_amount),
      fee_basis: form.fee_basis,
      fee_min: form.fee_min === "" ? null : Number(form.fee_min),
      fee_max: form.fee_max === "" ? null : Number(form.fee_max),
    }).eq("id", link.id);
    if (error) { alert(error.message); return; }
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove ${entityName} from this conference?`)) return;
    const supabase = createClient();
    await supabase.from("conference_entities").delete().eq("id", link.id);
    router.refresh();
  }

  const input = "rounded-md border border-gray-300 px-3 py-1.5 text-sm";

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{entityName}</div>
          <div className="text-xs text-gray-600">
            {Number(link.split_percentage).toFixed(1)}% of net · {feeTermsLabel(link)}
            {link.fee_label && <span className="ml-2 text-gray-400">({link.fee_label})</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOpen(!open)} className="text-xs text-brand hover:underline">{open ? "Close" : "Edit"}</button>
          <button onClick={remove} className="text-xs text-rose-600 hover:underline">Remove</button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 border-t border-gray-200 pt-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Split %</label>
            <input className={input} type="number" step="0.1" value={form.split_percentage}
              onChange={e => setForm({ ...form, split_percentage: Number(e.target.value) })} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Fee label (optional)</label>
            <input className={input} placeholder="e.g. Mining Summit management fee"
              value={form.fee_label} onChange={e => setForm({ ...form, fee_label: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Fee type</label>
            <select className={input} value={form.fee_type} onChange={e => setForm({ ...form, fee_type: e.target.value as FeeType })}>
              {FEE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500">{FEE_TYPES.find(t => t.value === form.fee_type)?.description}</p>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Fee amount ($)</label>
            <input className={input} type="number" step="0.01" value={form.fee_amount}
              onChange={e => setForm({ ...form, fee_amount: Number(e.target.value) })}
              disabled={form.fee_type === "split_only"} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Counted on</label>
            <select className={input} value={form.fee_basis} onChange={e => setForm({ ...form, fee_basis: e.target.value as FeeBasis })}
              disabled={form.fee_type === "split_only" || form.fee_type === "flat"}>
              {FEE_BASES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Min ($ — optional)</label>
            <input className={input} type="number" step="0.01" value={form.fee_min}
              onChange={e => setForm({ ...form, fee_min: e.target.value as unknown as number })}
              disabled={form.fee_type === "split_only"} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Max ($ — optional)</label>
            <input className={input} type="number" step="0.01" value={form.fee_max}
              onChange={e => setForm({ ...form, fee_max: e.target.value as unknown as number })}
              disabled={form.fee_type === "split_only"} />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button onClick={save} className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white">Save split + fee</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSplit({ conferenceId, entities, existing }: {
  conferenceId: string; entities: Entity[]; existing: ConferenceEntity[];
}) {
  const router = useRouter();
  const [entityId, setEntityId] = useState("");
  const [pct, setPct] = useState("");
  const available = entities.filter(e => !existing.some(l => l.entity_id === e.id));

  async function submit() {
    if (!entityId || !pct) return;
    const supabase = createClient();
    await supabase.from("conference_entities").insert({
      conference_id: conferenceId, entity_id: entityId, split_percentage: Number(pct),
    });
    setEntityId(""); setPct("");
    router.refresh();
  }

  if (available.length === 0) return <p className="mt-3 text-xs text-gray-400">All entities are already linked. Create more in the Entities tab.</p>;

  return (
    <div className="mt-3 flex items-center gap-2">
      <select value={entityId} onChange={e => setEntityId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
        <option value="">— pick entity —</option>
        {available.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <input value={pct} onChange={e => setPct(e.target.value)} type="number" placeholder="split %"
        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-xs" />
      <button onClick={submit} className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white">Add (then edit for fees)</button>
    </div>
  );
}
