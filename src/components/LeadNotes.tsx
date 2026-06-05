"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LeadNote, Profile, LeadType } from "@/lib/types";

export function LeadNotes({ notes, profiles, leadType, leadId, conferenceId, currentUserId }: {
  notes: LeadNote[];
  profiles: Profile[];
  leadType: LeadType;
  leadId: string;
  conferenceId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function addNote() {
    if (!body.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("lead_notes").insert({
      conference_id: conferenceId, lead_type: leadType, lead_id: leadId,
      user_id: currentUserId, body: body.trim(),
    });
    if (error) { alert(error.message); setSaving(false); return; }
    setBody("");
    router.refresh();
    setSaving(false);
  }

  async function deleteNote(noteId: string, noteUserId: string | null) {
    if (noteUserId !== currentUserId) {
      if (!confirm("This note was added by someone else. Delete anyway?")) return;
    } else if (!confirm("Delete this note?")) return;
    const supabase = createClient();
    await supabase.from("lead_notes").delete().eq("id", noteId);
    router.refresh();
  }

  const who = (id: string | null) => {
    if (!id) return "—";
    const p = profiles.find(x => x.id === id);
    return p?.full_name || p?.email || "—";
  };
  const when = (s: string) => new Date(s).toLocaleString();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Notes</h3>

      <div className="mt-3 flex gap-2">
        <textarea value={body} onChange={e => setBody(e.target.value)}
          rows={2} placeholder="Add a note — attribution and timestamp are recorded automatically"
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        <button onClick={addNote} disabled={saving || !body.trim()}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "…" : "Post"}
        </button>
      </div>

      <ol className="mt-4 space-y-3">
        {notes.length === 0 && <li className="text-sm text-gray-500">No notes yet.</li>}
        {notes.map(n => (
          <li key={n.id} className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <span className="font-medium">{who(n.user_id)}</span>
                <span className="text-xs text-gray-500"> · {when(n.created_at)}</span>
              </div>
              <button onClick={() => deleteNote(n.id, n.user_id)} className="text-xs text-rose-600 hover:underline">delete</button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-gray-800">{n.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
