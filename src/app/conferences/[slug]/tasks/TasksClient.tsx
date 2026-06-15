"use client";
import { useEffect, useState } from "react";
import type { HubTask, HubSuggestion } from "@/lib/hub";

type TaskLike = Pick<HubTask, "id" | "title" | "status" | "priority" | "due_date" | "notes" | "source">;

export function TasksClient({ slug, initialTasks, hasProject }: {
  slug: string;
  initialTasks: TaskLike[];
  hasProject: boolean;
}) {
  const [tasks, setTasks] = useState<TaskLike[]>(initialTasks);
  const [includeDone, setIncludeDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", notes: "", priority: "medium", due_date: "" });
  const [showAi, setShowAi] = useState(false);

  useEffect(() => {
    if (!hasProject) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDone]);

  async function refresh() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/tasks/sync?conference_id=${encodeURIComponent(slug)}${includeDone ? "&include_done=1" : ""}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally { setLoading(false); }
  }

  async function createTask() {
    if (!newTask.title.trim()) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/tasks/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conference_id: slug, title: newTask.title.trim(),
          notes: newTask.notes || undefined,
          priority: newTask.priority,
          due_date: newTask.due_date || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setNewTask({ title: "", notes: "", priority: "medium", due_date: "" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally { setCreating(false); }
  }

  async function toggleStatus(task: TaskLike) {
    const next = task.status === "done" ? "todo" : "done";
    try {
      const res = await fetch(`/api/tasks/sync?id=${encodeURIComponent(task.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setTasks(tasks.map(t => t.id === task.id ? { ...t, status: next } : t));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function deleteTask(id: string) {
    if (!confirm("Delete this task? (It will be removed from the Hub too.)")) return;
    try {
      const res = await fetch(`/api/tasks/sync?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setTasks(tasks.filter(t => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (!hasProject) {
    return (
      <div className="border border-ink/20 bg-white p-8 text-center">
        <p className="font-serif text-xl text-ink">Link a Hub project first</p>
        <p className="mt-2 text-sm text-ink/60">
          Open the Project Hub → pick the project for this conference → <strong>CRM conference link</strong> → enter <code className="rounded bg-cream px-1">{slug}</code> → Save.
        </p>
      </div>
    );
  }

  const input = "rounded-md border border-ink/20 bg-white px-3 py-1.5 text-sm focus:border-brand-accent focus:outline-none";
  const label = "block text-xs font-medium uppercase tracking-widest2 text-ink/60";

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      {/* Create */}
      <section className="border border-ink/20 bg-white p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest2 text-ink/60">New task</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-12">
          <input className={`${input} sm:col-span-5`} placeholder="Title"
            value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} />
          <select className={`${input} sm:col-span-2`} value={newTask.priority}
            onChange={e => setNewTask({ ...newTask, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input className={`${input} sm:col-span-2`} type="date" value={newTask.due_date}
            onChange={e => setNewTask({ ...newTask, due_date: e.target.value })} />
          <input className={`${input} sm:col-span-3`} placeholder="Notes (optional)"
            value={newTask.notes} onChange={e => setNewTask({ ...newTask, notes: e.target.value })} />
          <div className="sm:col-span-12 flex items-center gap-3">
            <button onClick={createTask} disabled={creating || !newTask.title.trim()}
              className="bg-ink px-4 py-1.5 text-xs uppercase tracking-widest2 text-cream disabled:opacity-50">
              {creating ? "Adding…" : "+ Add task"}
            </button>
            <button onClick={() => setShowAi(true)}
              className="border border-ink/20 px-4 py-1.5 text-xs uppercase tracking-widest2 hover:bg-cream">
              ✨ AI suggest tasks
            </button>
            <div className="ml-auto flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={includeDone} onChange={e => setIncludeDone(e.target.checked)} />
                Include completed
              </label>
              <button onClick={refresh} className="text-xs uppercase tracking-widest2 text-ink/60 hover:text-ink">
                {loading ? "…" : "↻ Refresh"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Task list */}
      <section className="border border-ink/20 bg-white">
        {tasks.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-ink/50">No tasks yet. Add one above or try AI suggest.</p>
        ) : (
          <ul>
            {tasks.map(t => (
              <li key={t.id} className="flex items-start gap-3 border-t border-ink/10 px-5 py-3 first:border-t-0">
                <input type="checkbox" checked={t.status === "done"} onChange={() => toggleStatus(t)} className="mt-1" />
                <div className="flex-1">
                  <div className={`text-sm ${t.status === "done" ? "line-through text-ink/40" : "font-medium"}`}>{t.title}</div>
                  {t.notes && <div className="mt-1 text-xs text-ink/60 whitespace-pre-wrap">{t.notes}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest2 text-ink/50">
                    {t.priority && <span className={`rounded-full px-1.5 py-0.5 ${t.priority === "high" ? "bg-rose-100 text-rose-700" : t.priority === "low" ? "bg-gray-100 text-gray-600" : "bg-amber-100 text-amber-700"}`}>{t.priority}</span>}
                    {t.due_date && <span>Due {t.due_date}</span>}
                    {t.source && <span className="text-ink/40">via {t.source}</span>}
                  </div>
                </div>
                <button onClick={() => deleteTask(t.id)} className="text-xs text-rose-600 hover:underline">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showAi && <SuggestionsModal slug={slug} onClose={() => setShowAi(false)} onCreated={refresh} />}
    </div>
  );
}

function SuggestionsModal({ slug, onClose, onCreated }: {
  slug: string; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [suggestions, setSuggestions] = useState<HubSuggestion[]>([]);
  const [editing, setEditing] = useState<{ keep: boolean; title: string; notes: string; priority: string }[]>([]);
  const [phase, setPhase] = useState<"input" | "review" | "creating" | "done">("input");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  async function fetchSuggestions() {
    if (!instruction.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/tasks/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest", conference_id: slug, instruction: instruction.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      const tasks: HubSuggestion[] = data.tasks ?? [];
      if (tasks.length === 0) { setError("No suggestions returned."); return; }
      setSuggestions(tasks);
      setEditing(tasks.map(t => ({ keep: true, title: t.title, notes: t.notes ?? "", priority: t.priority ?? "medium" })));
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch suggestions");
    }
  }

  async function createApproved() {
    const approved = editing.filter(e => e.keep && e.title.trim());
    if (approved.length === 0) { setError("Nothing approved."); return; }
    setPhase("creating"); setProgress({ done: 0, total: approved.length });
    for (let i = 0; i < approved.length; i++) {
      const t = approved[i];
      try {
        await fetch("/api/tasks/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conference_id: slug, title: t.title.trim(),
            notes: t.notes || undefined, priority: t.priority,
          }),
        });
      } catch {
        // continue creating the rest even if one fails
      }
      setProgress({ done: i + 1, total: approved.length });
    }
    await onCreated();
    setPhase("done");
    setTimeout(onClose, 500);
  }

  const input = "w-full rounded-md border border-ink/20 bg-white px-3 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-ink bg-cream p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-serif text-xl font-bold text-ink">AI suggest tasks</h3>
        {error && <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

        {phase === "input" && (
          <>
            <p className="mt-2 text-sm text-ink/60">Describe what you want broken down into tasks. The AI runs on the Hub; nothing is saved until you approve.</p>
            <textarea className={`${input} mt-3 min-h-[120px]`} value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="e.g. Plan sponsorship outreach from prospect list through signed agreements" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="border border-ink/20 px-3 py-1.5 text-xs uppercase tracking-widest2">Cancel</button>
              <button onClick={fetchSuggestions} disabled={!instruction.trim()}
                className="bg-ink px-4 py-1.5 text-xs uppercase tracking-widest2 text-cream disabled:opacity-50">
                Generate
              </button>
            </div>
          </>
        )}

        {phase === "review" && (
          <>
            <p className="mt-2 text-sm text-ink/60">{suggestions.length} task{suggestions.length === 1 ? "" : "s"} drafted. Uncheck or edit before saving.</p>
            <ul className="mt-3 space-y-2">
              {editing.map((e, i) => (
                <li key={i} className="rounded border border-ink/10 bg-white p-3">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={e.keep} onChange={ev =>
                      setEditing(editing.map((x, idx) => idx === i ? { ...x, keep: ev.target.checked } : x))} className="mt-1.5" />
                    <div className="flex-1 space-y-2">
                      <input className={input} value={e.title}
                        onChange={ev => setEditing(editing.map((x, idx) => idx === i ? { ...x, title: ev.target.value } : x))} />
                      <textarea className={`${input} min-h-[40px] text-xs`} value={e.notes}
                        onChange={ev => setEditing(editing.map((x, idx) => idx === i ? { ...x, notes: ev.target.value } : x))}
                        placeholder="Notes" />
                      <select className={`${input} w-32`} value={e.priority}
                        onChange={ev => setEditing(editing.map((x, idx) => idx === i ? { ...x, priority: ev.target.value } : x))}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPhase("input")} className="border border-ink/20 px-3 py-1.5 text-xs uppercase tracking-widest2">Back</button>
              <button onClick={createApproved}
                className="bg-brand-accent px-4 py-1.5 text-xs uppercase tracking-widest2 text-cream">
                Create {editing.filter(e => e.keep).length} task{editing.filter(e => e.keep).length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}

        {phase === "creating" && (
          <div className="py-8 text-center">
            <p className="font-medium">Creating tasks…</p>
            <p className="mt-2 text-sm text-ink/60">{progress.done} of {progress.total}</p>
          </div>
        )}

        {phase === "done" && (
          <div className="py-8 text-center">
            <p className="font-medium">Done — created {progress.total} task{progress.total === 1 ? "" : "s"}.</p>
          </div>
        )}
      </div>
    </div>
  );
}
