"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STAGES, CONFIRMED, PAYMENT_STATUSES, INDUSTRIES, INVESTOR_TYPES, ACTIVITY_ACTIONS } from "@/lib/constants";
import { canSeePayments, canEditLeads, canEditExpenses, type Profile, type Stage, type Confirmed, type PaymentStatus, type ConferenceRole } from "@/lib/types";

type Kind = "company" | "investor";
type Role = ConferenceRole | "super_admin";

interface Initial {
  id?: string;
  name: string;
  category: string | null;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  phone: string | null;
  owner_id: string | null;
  stage: Stage;
  confirmed: Confirmed;
  payment_status: PaymentStatus;
  amount_due: number;
  amount_paid: number;
  last_contact: string | null;
  next_action: string | null;
  next_action_date: string | null;
  source: string | null;
  notes: string | null;
  check_size?: string | null;
  sector_focus?: string | null;
}

export function LeadEditor({ kind, conferenceSlug, conferenceId, role, initial, profiles, currentUserId }: {
  kind: Kind; conferenceSlug: string; conferenceId: string; role: Role;
  initial: Initial; profiles: Profile[]; currentUserId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameField = kind === "company" ? "name" : "firm_name";
  const categoryField = kind === "company" ? "industry" : "investor_type";
  const categoryOptions = kind === "company" ? INDUSTRIES : INVESTOR_TYPES;
  const tableName = kind === "company" ? "companies" : "investors";

  const showMoney = canSeePayments(role);
  const canEdit = canEditLeads(role);
  // Finance can edit payment fields but not other lead fields; recruiters/admins/conference_admin can edit all
  const canEditMoney = canEditExpenses(role);

  const update = <K extends keyof Initial>(k: K, v: Initial[K]) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true); setError(null);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      [nameField]: form.name,
      [categoryField]: form.category,
      contact_name: form.contact_name, contact_title: form.contact_title,
      email: form.email, phone: form.phone, owner_id: form.owner_id,
      stage: form.stage, confirmed: form.confirmed,
      last_contact: form.last_contact || null,
      next_action: form.next_action, next_action_date: form.next_action_date || null,
      source: form.source, notes: form.notes,
    };
    if (showMoney) {
      payload.payment_status = form.payment_status;
      payload.amount_due = form.amount_due;
      payload.amount_paid = form.amount_paid;
    }
    if (kind === "investor") {
      payload.check_size = form.check_size; payload.sector_focus = form.sector_focus;
    }
    if (!form.id) payload.conference_id = conferenceId;

    let result;
    if (form.id) {
      result = await supabase.from(tableName).update(payload).eq("id", form.id).select().single();
    } else {
      result = await supabase.from(tableName).insert(payload).select().single();
    }

    if (result.error) { setError(result.error.message); setSaving(false); return; }
    router.push(`/conferences/${conferenceSlug}/${kind === "company" ? "companies" : "investors"}`);
    router.refresh();
  }

  async function claimForMe() {
    update("owner_id", currentUserId);
    if (form.id) {
      const supabase = createClient();
      await supabase.from(tableName).update({ owner_id: currentUserId }).eq("id", form.id);
      await logActivity("Claimed", null);
      router.refresh();
    }
  }

  async function logActivity(action: string, notes: string | null) {
    if (!form.id) return;
    const supabase = createClient();
    await supabase.from("activity_log").insert({
      user_id: currentUserId, lead_type: kind, lead_id: form.id,
      lead_name: form.name, action, notes, conference_id: conferenceId,
    });
  }

  async function deleteLead() {
    if (!form.id) return;
    if (!confirm("Delete this lead? Tip: set Stage to 'Declined' instead.")) return;
    const supabase = createClient();
    await supabase.from(tableName).delete().eq("id", form.id);
    router.push(`/conferences/${conferenceSlug}/${kind === "company" ? "companies" : "investors"}`);
    router.refresh();
  }

  const input = "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none";
  const inputDisabled = `${input} bg-gray-50 text-gray-500`;
  const label = "block text-xs font-medium uppercase tracking-wide text-gray-500";

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>{kind === "company" ? "Company name" : "Firm / investor name"}</label>
          <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
            value={form.name} onChange={e => update("name", e.target.value)} />
        </div>
        <div>
          <label className={label}>{kind === "company" ? "Industry" : "Type"}</label>
          <select className={canEdit ? input : inputDisabled} disabled={!canEdit}
            value={form.category ?? ""} onChange={e => update("category", e.target.value || null)}>
            <option value="">—</option>
            {categoryOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Owner</label>
          <div className="flex gap-2">
            <select className={canEdit ? input : inputDisabled} disabled={!canEdit}
              value={form.owner_id ?? ""} onChange={e => update("owner_id", e.target.value || null)}>
              <option value="">Unclaimed</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
            {canEdit && form.owner_id !== currentUserId && (
              <button type="button" onClick={claimForMe}
                className="whitespace-nowrap rounded-md border border-brand bg-brand-light px-3 py-1.5 text-xs font-medium text-brand">Claim</button>
            )}
          </div>
        </div>

        <div><label className={label}>Contact name</label>
          <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
            value={form.contact_name ?? ""} onChange={e => update("contact_name", e.target.value)} /></div>
        <div><label className={label}>Contact title</label>
          <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
            value={form.contact_title ?? ""} onChange={e => update("contact_title", e.target.value)} /></div>
        <div><label className={label}>Email</label>
          <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
            type="email" value={form.email ?? ""} onChange={e => update("email", e.target.value)} /></div>
        <div><label className={label}>Phone</label>
          <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
            value={form.phone ?? ""} onChange={e => update("phone", e.target.value)} /></div>

        {kind === "investor" && <>
          <div><label className={label}>Check size</label>
            <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
              value={form.check_size ?? ""} onChange={e => update("check_size", e.target.value)} placeholder="e.g. $1-5M Series A" /></div>
          <div><label className={label}>Sector focus</label>
            <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
              value={form.sector_focus ?? ""} onChange={e => update("sector_focus", e.target.value)} /></div>
        </>}

        <div>
          <label className={label}>Stage</label>
          <select className={canEdit ? input : inputDisabled} disabled={!canEdit}
            value={form.stage} onChange={e => update("stage", e.target.value as Stage)}>
            {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Confirmed</label>
          <select className={canEdit ? input : inputDisabled} disabled={!canEdit}
            value={form.confirmed} onChange={e => update("confirmed", e.target.value as Confirmed)}>
            {CONFIRMED.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {showMoney && <>
          <div>
            <label className={label}>Payment status</label>
            <select className={canEditMoney ? input : inputDisabled} disabled={!canEditMoney}
              value={form.payment_status} onChange={e => update("payment_status", e.target.value as PaymentStatus)}>
              {PAYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Amount due ($)</label>
            <input className={canEditMoney ? input : inputDisabled} disabled={!canEditMoney}
              type="number" value={form.amount_due} onChange={e => update("amount_due", Number(e.target.value))} />
          </div>
          <div>
            <label className={label}>Amount paid ($)</label>
            <input className={canEditMoney ? input : inputDisabled} disabled={!canEditMoney}
              type="number" value={form.amount_paid} onChange={e => update("amount_paid", Number(e.target.value))} />
          </div>
        </>}

        <div>
          <label className={label}>Last contact</label>
          <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
            type="date" value={form.last_contact ?? ""} onChange={e => update("last_contact", e.target.value)} />
        </div>
        <div>
          <label className={label}>Next action date</label>
          <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
            type="date" value={form.next_action_date ?? ""} onChange={e => update("next_action_date", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Next action</label>
          <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
            value={form.next_action ?? ""} onChange={e => update("next_action", e.target.value)} placeholder="Send sponsor deck" />
        </div>
        <div>
          <label className={label}>Source</label>
          <input className={canEdit ? input : inputDisabled} disabled={!canEdit}
            value={form.source ?? ""} onChange={e => update("source", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Notes</label>
          <textarea className={`${canEdit ? input : inputDisabled} min-h-[100px]`} disabled={!canEdit}
            value={form.notes ?? ""} onChange={e => update("notes", e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <div>
          {form.id && canEdit && (
            <button onClick={deleteLead} className="text-sm text-rose-600 hover:underline">Delete</button>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={() => router.back()} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">Cancel</button>
          {(canEdit || canEditMoney) && (
            <button onClick={save} disabled={saving || !form.name}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50">
              {saving ? "Saving…" : (form.id ? "Save changes" : "Create")}
            </button>
          )}
        </div>
      </div>

      {form.id && canEdit && <QuickLogActivity onLog={async (action, notes) => {
        await logActivity(action, notes);
        router.refresh();
      }} />}
    </div>
  );
}

function QuickLogActivity({ onLog }: { onLog: (action: string, notes: string | null) => Promise<void> }) {
  const [action, setAction] = useState("Email Sent");
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);

  async function submit() {
    setLogging(true);
    await onLog(action, notes || null);
    setNotes("");
    setLogging(false);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Log activity</h3>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={action} onChange={e => setAction(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
          {ACTIVITY_ACTIONS.map(a => <option key={a}>{a}</option>)}
        </select>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional note…"
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        <button onClick={submit} disabled={logging}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white">Log</button>
      </div>
    </div>
  );
}
