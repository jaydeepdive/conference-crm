"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EmailTemplate, EmailKind } from "@/lib/types";

const KINDS: EmailKind[] = ["invoice","reminder","welcome","marketing","registration","general","other"];

export function TemplatesManager({ conferenceId, templates }: { conferenceId: string; templates: EmailTemplate[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function save(t: EmailTemplate, isNew = false) {
    const supabase = createClient();
    if (isNew) {
      await supabase.from("email_templates").insert({
        conference_id: conferenceId, name: t.name, kind: t.kind, subject: t.subject, body: t.body,
      });
    } else {
      await supabase.from("email_templates").update({
        name: t.name, kind: t.kind, subject: t.subject, body: t.body,
      }).eq("id", t.id);
    }
    setEditingId(null); setCreating(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this template?")) return;
    const supabase = createClient();
    await supabase.from("email_templates").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <button onClick={() => setCreating(true)}
          className="bg-ink px-4 py-2 text-xs uppercase tracking-widest2 text-cream hover:bg-brand-accent">
          + New template
        </button>
      )}
      {creating && (
        <TemplateEditor template={{ id: "", conference_id: conferenceId, name: "", kind: "general", subject: "", body: "", created_by: null, created_at: "", updated_at: "" }}
          isNew={true} onSave={(t) => save(t, true)} onCancel={() => setCreating(false)} />
      )}

      <div className="space-y-3">
        {templates.map(t => editingId === t.id ? (
          <TemplateEditor key={t.id} template={t} isNew={false}
            onSave={(updated) => save(updated)} onCancel={() => setEditingId(null)} />
        ) : (
          <div key={t.id} className="border border-ink/20 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold">{t.name}</h4>
                <p className="text-xs text-ink/60">{t.kind} · subject: <em>{t.subject}</em></p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingId(t.id)} className="text-xs text-brand-accent hover:underline">Edit</button>
                <button onClick={() => remove(t.id)} className="text-xs text-rose-600 hover:underline">Delete</button>
              </div>
            </div>
            <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-ink/70">{t.body}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({ template, isNew, onSave, onCancel }: {
  template: EmailTemplate; isNew: boolean;
  onSave: (t: EmailTemplate) => void; onCancel: () => void;
}) {
  const [t, setT] = useState(template);
  const input = "w-full rounded-md border border-ink/20 bg-white px-3 py-1.5 text-sm";
  const label = "block text-xs font-medium uppercase tracking-widest2 text-ink/60";
  return (
    <div className="border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><label className={label}>Name</label>
          <input className={input} value={t.name} onChange={e => setT({ ...t, name: e.target.value })} /></div>
        <div><label className={label}>Kind</label>
          <select className={input} value={t.kind} onChange={e => setT({ ...t, kind: e.target.value as EmailKind })}>
            {KINDS.map(k => <option key={k}>{k}</option>)}
          </select></div>
      </div>
      <div><label className={label}>Subject</label>
        <input className={input} value={t.subject} onChange={e => setT({ ...t, subject: e.target.value })} /></div>
      <div><label className={label}>Body</label>
        <textarea className={`${input} min-h-[200px] font-mono`} value={t.body} onChange={e => setT({ ...t, body: e.target.value })} /></div>
      <p className="text-xs text-ink/60">Variables: <code>&#123;&#123;lead_name&#125;&#125;</code>, <code>&#123;&#123;recipient_name&#125;&#125;</code>, <code>&#123;&#123;sender_name&#125;&#125;</code>, <code>&#123;&#123;conference_name&#125;&#125;</code>, <code>&#123;&#123;invoice_number&#125;&#125;</code>, <code>&#123;&#123;total&#125;&#125;</code>, <code>&#123;&#123;due_date&#125;&#125;</code>.</p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="border border-ink/20 px-3 py-1.5 text-xs">Cancel</button>
        <button onClick={() => onSave(t)} disabled={!t.name || !t.subject || !t.body}
          className="bg-ink px-4 py-1.5 text-xs uppercase tracking-widest2 text-cream disabled:opacity-50">
          {isNew ? "Create" : "Save"}
        </button>
      </div>
    </div>
  );
}
