"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  FullProjectResponse, HubTask, HubCategory, HubTeamMember,
  HubExpense, HubNote, HubSuggestion, HubProject, HubFinancials,
} from "@/lib/hub";

type StatusBucket = "todo" | "in_progress" | "done";
type Filter = "all" | "open" | "done";

const RED = "#C8102E";
const INK = "#0E0E0E";
const MUTED = "#6B6B6B";
const LINE = "#E5E5E5";

function bucketOf(s: string | undefined | null): StatusBucket {
  if (s === "done" || s === "completed") return "done";
  if (s === "in_progress" || s === "active" || s === "doing") return "in_progress";
  return "todo";
}

const usd = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

export function ProjectHubClient({
  slug, initialFullProject, initialNotes, showFinancials,
}: {
  slug: string;
  initialFullProject: FullProjectResponse | null;
  initialNotes: HubNote[];
  showFinancials: boolean;
}) {
  const router = useRouter();
  const [full, setFull] = useState<FullProjectResponse | null>(initialFullProject);
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", notes: "", priority: "medium", due_date: "", category: "" });
  const [showAi, setShowAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const project = full?.project ?? null;
  const tasks = full?.tasks ?? [];
  const categories = full?.categories ?? [];
  const team = full?.team ?? [];
  const financials = full?.financials ?? null;

  // Counts
  const counts = useMemo(() => {
    let todo = 0, in_progress = 0, done = 0;
    for (const t of tasks) {
      const b = bucketOf(t.status);
      if (b === "done") done++;
      else if (b === "in_progress") in_progress++;
      else todo++;
    }
    return { todo, in_progress, done, total: tasks.length };
  }, [tasks]);

  // Build a parent → children map
  const childrenByParent = useMemo(() => {
    const map = new Map<string, HubTask[]>();
    for (const t of tasks) {
      const key = t.parent_id ?? "__root__";
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  // Group root tasks by category
  const rootsByCategory = useMemo(() => {
    const roots = (childrenByParent.get("__root__") ?? []);
    const grouped = new Map<string, HubTask[]>();
    for (const t of roots) {
      const cat = t.category ?? "__uncategorized__";
      const arr = grouped.get(cat) ?? [];
      arr.push(t);
      grouped.set(cat, arr);
    }
    return grouped;
  }, [childrenByParent]);

  // Filter helper for visible tasks (including subtree)
  function isTaskVisible(t: HubTask): boolean {
    const b = bucketOf(t.status);
    if (filter === "open" && b === "done") return false;
    if (filter === "done" && b !== "done") return false;
    if (search) {
      const hay = `${t.title} ${t.notes ?? ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }

  async function refresh() {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/sync?conference_id=${encodeURIComponent(slug)}&include_done=1`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      // The /api/tasks/sync still returns just tasks; rather than diverge, do a hard page refresh
      // (server re-fetches full project).
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    }
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
          category: newTask.category || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setNewTask({ title: "", notes: "", priority: "medium", due_date: "", category: "" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally { setCreating(false); }
  }

  async function setStatus(task: HubTask, status: StatusBucket | string) {
    try {
      const res = await fetch(`/api/tasks/sync?id=${encodeURIComponent(task.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      // Optimistic update
      if (full) {
        setFull({
          ...full,
          tasks: full.tasks.map(t => t.id === task.id ? { ...t, status } : t),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function deleteTask(id: string) {
    if (!confirm("Delete this task? (It will be removed from the Hub too — including any subtasks.)")) return;
    try {
      const res = await fetch(`/api/tasks/sync?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (!project) {
    return (
      <div className="border border-line bg-white p-8 text-center">
        <p className="font-display text-xl text-ink">Link a Hub project first</p>
        <p className="mt-2 text-sm text-muted">
          Open the Project Hub → pick the project for this conference → <strong>CRM conference link</strong> →
          enter <code className="rounded bg-utility px-1">{slug}</code> → Save.
        </p>
      </div>
    );
  }

  const input = "rounded-md border border-line bg-white px-3 py-1.5 text-sm focus:border-[#C8102E] focus:outline-none";
  const visibleSearchOrFilter = filter !== "open" || search !== "";

  return (
    <div className="space-y-8">
      {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      {/* PROJECT HEADER */}
      <ProjectHeader project={project} counts={counts} />

      {/* FINANCIALS — only visible to finance + admin */}
      {showFinancials && financials && <FinancialsPanel financials={financials} />}

      {/* CONTROLS BAR */}
      <section className="border border-line bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-12">
          <input className={`${input} sm:col-span-4`} placeholder="Add a task…"
            value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") createTask(); }} />
          {categories.length > 0 && (
            <select className={`${input} sm:col-span-2`} value={newTask.category}
              onChange={e => setNewTask({ ...newTask, category: e.target.value })}>
              <option value="">— category —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select className={`${input} sm:col-span-${categories.length > 0 ? 2 : 2}`} value={newTask.priority}
            onChange={e => setNewTask({ ...newTask, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input className={`${input} sm:col-span-2`} type="date" value={newTask.due_date}
            onChange={e => setNewTask({ ...newTask, due_date: e.target.value })} />
          <input className={`${input} sm:col-span-${categories.length > 0 ? 2 : 4}`} placeholder="Notes (optional)"
            value={newTask.notes} onChange={e => setNewTask({ ...newTask, notes: e.target.value })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={createTask} disabled={creating || !newTask.title.trim()}
            style={{ backgroundColor: RED, color: "#FFFFFF" }}
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50">
            {creating ? "Adding…" : "+ Add task"}
          </button>
          <button onClick={() => setShowAi(true)}
            style={{ borderColor: LINE, color: INK }}
            className="border bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest2 hover:border-[#C8102E]">
            ✨ AI suggest tasks
          </button>
          <div className="ml-auto flex items-center gap-3 text-[11px] uppercase tracking-widest2">
            <FilterBtn active={filter === "open"} onClick={() => setFilter("open")}>Open</FilterBtn>
            <FilterBtn active={filter === "done"} onClick={() => setFilter("done")}>Done</FilterBtn>
            <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>All</FilterBtn>
            <input className={`${input} max-w-[180px]`} placeholder="Search…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </section>

      {/* TASK TREE — grouped by category */}
      {tasks.length === 0 ? (
        <section className="border border-line bg-white p-12 text-center text-sm text-muted">
          No tasks yet. Add one above or try AI suggest.
        </section>
      ) : (
        <section className="space-y-6">
          {/* Categories with tasks */}
          {categories.map(cat => {
            const roots = rootsByCategory.get(cat.id) ?? [];
            const visibleRoots = roots.filter(isTaskVisible);
            // Show category if any root or any descendant matches (rough check via roots)
            if (visibleRoots.length === 0 && !visibleSearchOrFilter) return null;
            if (visibleRoots.length === 0) return null;
            return (
              <CategorySection key={cat.id} category={cat} roots={visibleRoots}
                childrenByParent={childrenByParent}
                isVisible={isTaskVisible}
                onToggle={setStatus} onDelete={deleteTask} />
            );
          })}

          {/* Uncategorized roots */}
          {(rootsByCategory.get("__uncategorized__") ?? []).filter(isTaskVisible).length > 0 && (
            <CategorySection
              category={{ id: "__uncategorized__", name: "Uncategorized", position: 999 }}
              roots={(rootsByCategory.get("__uncategorized__") ?? []).filter(isTaskVisible)}
              childrenByParent={childrenByParent}
              isVisible={isTaskVisible}
              onToggle={setStatus} onDelete={deleteTask} />
          )}
        </section>
      )}

      {/* TEAM */}
      {team.length > 0 && (
        <section>
          <div className="section-rule flex items-end justify-between">
            <h2 className="font-display text-[22px] font-bold leading-none text-ink">Team</h2>
            <span className="text-[11px] font-medium uppercase tracking-widest2 text-muted">{team.length} MEMBERS</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {team.map(m => (
              <div key={m.id} className="border border-line bg-white p-3 text-sm">
                <div className="font-medium text-ink">{m.name}</div>
                <div className="text-xs text-muted">{m.email}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* EXPENSES — only if financials are visible */}
      {showFinancials && financials && financials.expenses.length > 0 && (
        <section>
          <div className="section-rule flex items-end justify-between">
            <h2 className="font-display text-[22px] font-bold leading-none text-ink">Expenses</h2>
            <span className="text-[11px] font-medium uppercase tracking-widest2 text-muted">
              {financials.expenses.length} ITEMS · {usd(financials.costs.total)} TOTAL
            </span>
          </div>
          <div className="mt-4 border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-[10px] uppercase tracking-widest2 text-muted">
                <tr>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Vendor</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {financials.expenses.map((ex, i) => <ExpenseRow key={i} ex={ex} />)}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* QUICK NOTES */}
      {initialNotes.length > 0 && (
        <section>
          <div className="section-rule flex items-end justify-between">
            <h2 className="font-display text-[22px] font-bold leading-none text-ink">Quick notes</h2>
            <span className="text-[11px] font-medium uppercase tracking-widest2 text-muted">{initialNotes.length} UNFILED</span>
          </div>
          <ul className="mt-4 space-y-2">
            {initialNotes.map(n => (
              <li key={n.id} className="border border-line bg-white p-3 text-sm">
                <div className="whitespace-pre-wrap text-ink">{n.body}</div>
                <div className="mt-2 flex gap-2 text-[10px] uppercase tracking-widest2 text-muted">
                  <span>{new Date(n.created_at).toLocaleString()}</span>
                  {n.author && <span>· {n.author}</span>}
                  {n.source && <span>· {n.source}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showAi && <SuggestionsModal slug={slug} categories={categories} onClose={() => setShowAi(false)} onCreated={refresh} />}
    </div>
  );
}

// ---- Sub-components ----

function ProjectHeader({ project, counts }: { project: HubProject; counts: { todo: number; in_progress: number; done: number; total: number } }) {
  const pct = project.progress?.pct ?? (counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0);
  const onTrack = project.schedule !== "behind";
  const dateLine = [project.start_date, project.target_date].filter(Boolean).join(" → ");
  return (
    <section className="border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-[300px]">
          <h2 className="font-display text-[26px] font-bold leading-none text-ink">
            {project.title ?? project.name ?? project.id}
          </h2>
          {project.description && <p className="mt-2 text-sm text-muted">{project.description}</p>}
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] uppercase tracking-widest2 text-muted">
            {project.status && <span>Status: <strong className="normal-case tracking-normal text-ink">{project.status}</strong></span>}
            {dateLine && <span>· {dateLine}</span>}
            {project.owner_email || project.owner ? <span>· Owner: <strong className="normal-case tracking-normal text-ink">{project.owner_email ?? project.owner}</strong></span> : null}
            {project.schedule && (
              <span className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: onTrack ? "#DCFCE7" : "#FEE2E2", color: onTrack ? "#166534" : "#991B1B" }}>
                {project.schedule === "on_track" ? "On track" : project.schedule}
              </span>
            )}
          </div>
        </div>
        <a href={project.url ?? "https://hub.thedeepdive.ca"} target="_blank" rel="noopener"
          className="border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest2 hover:border-ink">
          Open in Hub ↗
        </a>
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="flex justify-between text-[11px] uppercase tracking-widest2 text-muted">
          <span>Progress</span>
          <span>{pct}% · {counts.done} of {counts.total} done</span>
        </div>
        <div className="mt-2 h-2 w-full bg-utility">
          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: RED }}></div>
        </div>
      </div>

      {/* Status pills */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <PillTile label="To Do" count={counts.todo} color={INK} />
        <PillTile label="In Progress" count={counts.in_progress} color={RED} />
        <PillTile label="Done" count={counts.done} color={MUTED} />
      </div>
    </section>
  );
}

function PillTile({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="border border-line bg-utility p-3">
      <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest2 text-muted">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }}></span>
        {label}
      </div>
      <div className="mt-1 font-display text-[26px] font-bold leading-none text-ink tabular-nums">{count}</div>
    </div>
  );
}

function FinancialsPanel({ financials }: { financials: HubFinancials }) {
  const budget = Number(financials.budget ?? 0);
  const spent = Number(financials.costs.total);
  const remaining = Number(financials.remaining_budget);
  const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const incomeReceived = Number(financials.income.received);
  const incomeInvoiced = Number(financials.income.invoiced);

  return (
    <section>
      <div className="section-rule flex items-end justify-between">
        <h2 className="font-display text-[22px] font-bold leading-none text-ink">Financials</h2>
        <span className="text-[11px] font-medium uppercase tracking-widest2 text-muted">From the Hub · synced with CRM income</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <FinTile label="Budget" value={usd(budget)} tone="ink" />
        <FinTile label="Spent" value={usd(spent)} tone="muted"
          sub={budget > 0 ? `${budgetPct}% of budget` : undefined} />
        <FinTile label="Income · received" value={usd(incomeReceived)} tone="red"
          sub={`Invoiced ${usd(incomeInvoiced)}`} />
        <FinTile label="Net" value={usd(financials.net)} tone={financials.net >= 0 ? "green" : "red"}
          sub={`Remaining budget ${usd(remaining)}`} />
      </div>

      {budget > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-[11px] uppercase tracking-widest2 text-muted">
            <span>Budget used</span>
            <span>{usd(spent)} / {usd(budget)}</span>
          </div>
          <div className="mt-2 h-2 w-full bg-utility">
            <div className="h-full" style={{
              width: `${budgetPct}%`,
              backgroundColor: budgetPct > 90 ? RED : budgetPct > 70 ? "#D97706" : INK,
            }}></div>
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <CostBreakdown label="Paid" value={financials.costs.paid} />
        <CostBreakdown label="Committed" value={financials.costs.committed} />
        <CostBreakdown label="Planned" value={financials.costs.planned} />
      </div>
    </section>
  );
}

function FinTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "ink" | "muted" | "red" | "green" }) {
  const colors = {
    ink: INK, muted: MUTED, red: RED, green: "#15803D",
  };
  return (
    <div className="border border-line bg-white p-4">
      <div className="text-[10px] font-medium uppercase tracking-widest2 text-muted">{label}</div>
      <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums" style={{ color: colors[tone] }}>{value}</div>
      {sub && <div className="mt-2 text-[11px] uppercase tracking-widest2 text-muted">{sub}</div>}
    </div>
  );
}

function CostBreakdown({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line bg-utility p-3 text-sm">
      <div className="text-[10px] font-medium uppercase tracking-widest2 text-muted">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{usd(value)}</div>
    </div>
  );
}

function CategorySection({
  category, roots, childrenByParent, isVisible, onToggle, onDelete,
}: {
  category: HubCategory;
  roots: HubTask[];
  childrenByParent: Map<string, HubTask[]>;
  isVisible: (t: HubTask) => boolean;
  onToggle: (t: HubTask, status: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div>
      <div className="section-rule flex items-end justify-between">
        <h2 className="font-display text-[22px] font-bold leading-none text-ink">{category.name}</h2>
        <span className="text-[11px] font-medium uppercase tracking-widest2 text-muted">{roots.length} ROOT TASKS</span>
      </div>
      <ul className="mt-4 border border-line bg-white">
        {roots.map(t => (
          <TaskRow key={t.id} task={t} depth={0}
            childrenByParent={childrenByParent} isVisible={isVisible}
            onToggle={onToggle} onDelete={onDelete} />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({
  task, depth, childrenByParent, isVisible, onToggle, onDelete,
}: {
  task: HubTask;
  depth: number;
  childrenByParent: Map<string, HubTask[]>;
  isVisible: (t: HubTask) => boolean;
  onToggle: (t: HubTask, status: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const b = bucketOf(task.status);
  const isDone = b === "done";
  const subTasks = (childrenByParent.get(task.id) ?? []).filter(isVisible);

  return (
    <>
      <li className="flex items-start gap-3 border-t border-line px-5 py-3 first:border-t-0"
        style={{ paddingLeft: `${20 + depth * 24}px` }}>
        <button onClick={() => onToggle(task, isDone ? "todo" : "done")}
          className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-2"
          style={{
            borderColor: isDone ? MUTED : INK,
            backgroundColor: isDone ? MUTED : "transparent",
          }}
          title={isDone ? "Mark to do" : "Mark done"}>
          {isDone && <span className="block text-[10px] leading-none text-white">✓</span>}
        </button>

        <div className="flex-1">
          <div className={`text-sm ${isDone ? "line-through text-muted" : "font-medium text-ink"}`}>{task.title}</div>
          {task.notes && <div className="mt-1 whitespace-pre-wrap text-xs text-muted">{task.notes}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest2 text-muted">
            {task.priority && (
              <span className="rounded-full px-1.5 py-0.5"
                style={{
                  backgroundColor: task.priority === "high" ? "#FEE2E2" : task.priority === "low" ? "#F3F4F6" : "#FEF3C7",
                  color: task.priority === "high" ? "#991B1B" : task.priority === "low" ? "#374151" : "#92400E",
                }}>{task.priority}</span>
            )}
            {b === "in_progress" && (
              <span className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: RED, color: "#FFFFFF" }}>In progress</span>
            )}
            {task.start_date && <span>Start {task.start_date}</span>}
            {task.due_date && <span>Due {task.due_date}</span>}
            {task.assignee && <span>· {task.assignee}</span>}
            {task.source && <span>· via {task.source}</span>}
          </div>

          {task.comments && task.comments.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] font-semibold uppercase tracking-widest2 text-muted hover:text-ink cursor-pointer">
                {task.comments.length} comment{task.comments.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 space-y-1.5 border-l border-line pl-3">
                {task.comments.map((c, i) => (
                  <li key={i} className="text-xs">
                    <div className="text-[10px] uppercase tracking-widest2 text-muted">{c.author} · {new Date(c.created_at).toLocaleDateString()}</div>
                    <div className="mt-0.5 text-ink whitespace-pre-wrap">{c.body}</div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isDone && b !== "in_progress" && (
            <button onClick={() => onToggle(task, "in_progress")}
              className="text-[10px] font-semibold uppercase tracking-widest2 text-muted hover:text-ink">
              Start
            </button>
          )}
          <button onClick={() => onDelete(task.id)}
            className="text-[10px] font-semibold uppercase tracking-widest2 text-muted hover:text-[#C8102E]">
            Delete
          </button>
        </div>
      </li>

      {/* Recurse into subtasks */}
      {subTasks.map(s => (
        <TaskRow key={s.id} task={s} depth={depth + 1}
          childrenByParent={childrenByParent} isVisible={isVisible}
          onToggle={onToggle} onDelete={onDelete} />
      ))}
    </>
  );
}

function ExpenseRow({ ex }: { ex: HubExpense }) {
  return (
    <tr className="border-t border-line">
      <td className="px-4 py-2 font-medium text-ink">{ex.description}</td>
      <td className="px-4 py-2 text-muted">{ex.vendor ?? "—"}</td>
      <td className="px-4 py-2 text-xs uppercase tracking-widest2 text-muted">{ex.category ?? "—"}</td>
      <td className="px-4 py-2">
        <span className="rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-widest2"
          style={{
            backgroundColor: ex.status === "paid" ? "#DCFCE7" : ex.status === "committed" ? "#FEF3C7" : "#F3F4F6",
            color: ex.status === "paid" ? "#166534" : ex.status === "committed" ? "#92400E" : "#374151",
          }}>{ex.status}</span>
      </td>
      <td className="px-4 py-2 text-xs text-muted">{ex.incurred_on ?? "—"}</td>
      <td className="px-4 py-2 text-right font-semibold tabular-nums">{usd(ex.amount)}</td>
      <td className="px-4 py-2">
        {ex.receipt_url
          ? <a href={ex.receipt_url} target="_blank" rel="noopener"
              className="text-[11px] uppercase tracking-widest2 hover:underline" style={{ color: RED }}>view</a>
          : <span className="text-xs text-muted">—</span>}
      </td>
    </tr>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ backgroundColor: active ? INK : "transparent", color: active ? "#FFFFFF" : INK }}
      className={`px-2.5 py-1 font-semibold ${active ? "" : "hover:bg-utility"}`}>
      {children}
    </button>
  );
}

// ---- AI Suggestions Modal (now handles nested categories + subtasks) ----

function SuggestionsModal({ slug, categories, onClose, onCreated }: {
  slug: string; categories: HubCategory[]; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [suggestions, setSuggestions] = useState<HubSuggestion[]>([]);
  const [editing, setEditing] = useState<Array<{
    keep: boolean; title: string; notes: string; priority: string; category: string;
    subtasks: Array<{ keep: boolean; title: string; notes: string; priority: string }>;
  }>>([]);
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
      setEditing(tasks.map(t => ({
        keep: true,
        title: t.title,
        notes: t.notes ?? "",
        priority: t.priority ?? "medium",
        category: matchCategoryId(t.category, categories) ?? "",
        subtasks: (t.subtasks ?? []).map(s => ({
          keep: true,
          title: s.title,
          notes: s.notes ?? "",
          priority: s.priority ?? "medium",
        })),
      })));
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch suggestions");
    }
  }

  function matchCategoryId(catName: string | undefined, cats: HubCategory[]): string | undefined {
    if (!catName) return undefined;
    const exact = cats.find(c => c.name.toLowerCase() === catName.toLowerCase());
    return exact?.id;
  }

  async function createApproved() {
    const approvedParents = editing.filter(e => e.keep && e.title.trim());
    let totalCount = 0;
    for (const p of approvedParents) {
      totalCount++;
      totalCount += p.subtasks.filter(s => s.keep && s.title.trim()).length;
    }
    if (totalCount === 0) { setError("Nothing approved."); return; }

    setPhase("creating"); setProgress({ done: 0, total: totalCount });
    let processed = 0;

    for (const parent of approvedParents) {
      let parentId: string | undefined;
      try {
        const res = await fetch("/api/tasks/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conference_id: slug, title: parent.title.trim(),
            notes: parent.notes || undefined,
            priority: parent.priority,
            category: parent.category || undefined,
          }),
        });
        if (res.ok) {
          const created = await res.json();
          parentId = created.id;
        }
      } catch { /* continue */ }
      processed++;
      setProgress({ done: processed, total: totalCount });

      // Create approved subtasks
      for (const sub of parent.subtasks.filter(s => s.keep && s.title.trim())) {
        try {
          await fetch("/api/tasks/sync", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conference_id: slug, title: sub.title.trim(),
              notes: sub.notes || undefined,
              priority: sub.priority,
              category: parent.category || undefined,
              parent_id: parentId,
            }),
          });
        } catch { /* continue */ }
        processed++;
        setProgress({ done: processed, total: totalCount });
      }
    }

    await onCreated();
    setPhase("done");
    setTimeout(onClose, 600);
  }

  const input = "w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-ink bg-white p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold text-ink">AI suggest tasks</h3>
        {error && <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

        {phase === "input" && (
          <>
            <p className="mt-2 text-sm text-muted">Describe what you want broken down. The Hub&apos;s AI returns categorized tasks with subtasks where appropriate. Nothing is saved until you approve.</p>
            <textarea className={`${input} mt-3 min-h-[120px]`} value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="e.g. Plan sponsorship outreach from prospect list through signed agreements" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="border border-line px-3 py-1.5 text-xs uppercase tracking-widest2">Cancel</button>
              <button onClick={fetchSuggestions} disabled={!instruction.trim()}
                style={{ backgroundColor: INK, color: "#FFFFFF" }}
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50">
                Generate
              </button>
            </div>
          </>
        )}

        {phase === "review" && (
          <>
            <p className="mt-2 text-sm text-muted">{suggestions.length} task{suggestions.length === 1 ? "" : "s"} drafted. Uncheck or edit before saving.</p>
            <ul className="mt-3 space-y-3">
              {editing.map((e, i) => (
                <li key={i} className="rounded border border-line bg-white p-3">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={e.keep} onChange={ev =>
                      setEditing(editing.map((x, idx) => idx === i ? { ...x, keep: ev.target.checked } : x))} className="mt-1.5" />
                    <div className="flex-1 space-y-2">
                      <input className={input} value={e.title}
                        onChange={ev => setEditing(editing.map((x, idx) => idx === i ? { ...x, title: ev.target.value } : x))} />
                      <textarea className={`${input} min-h-[40px] text-xs`} value={e.notes}
                        onChange={ev => setEditing(editing.map((x, idx) => idx === i ? { ...x, notes: ev.target.value } : x))}
                        placeholder="Notes" />
                      <div className="flex gap-2">
                        <select className={`${input} w-32`} value={e.priority}
                          onChange={ev => setEditing(editing.map((x, idx) => idx === i ? { ...x, priority: ev.target.value } : x))}>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        {categories.length > 0 && (
                          <select className={`${input} flex-1`} value={e.category}
                            onChange={ev => setEditing(editing.map((x, idx) => idx === i ? { ...x, category: ev.target.value } : x))}>
                            <option value="">— uncategorized —</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                      </div>

                      {e.subtasks.length > 0 && (
                        <div className="mt-2 border-l-2 border-line pl-3 space-y-2">
                          <div className="text-[10px] font-semibold uppercase tracking-widest2 text-muted">
                            {e.subtasks.length} SUBTASK{e.subtasks.length === 1 ? "" : "S"}
                          </div>
                          {e.subtasks.map((s, si) => (
                            <div key={si} className="flex items-start gap-2">
                              <input type="checkbox" checked={s.keep} onChange={ev =>
                                setEditing(editing.map((x, idx) => idx === i ? {
                                  ...x, subtasks: x.subtasks.map((y, yi) => yi === si ? { ...y, keep: ev.target.checked } : y),
                                } : x))} className="mt-1.5" />
                              <input className={`${input} flex-1 text-xs`} value={s.title}
                                onChange={ev => setEditing(editing.map((x, idx) => idx === i ? {
                                  ...x, subtasks: x.subtasks.map((y, yi) => yi === si ? { ...y, title: ev.target.value } : y),
                                } : x))} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPhase("input")} className="border border-line px-3 py-1.5 text-xs uppercase tracking-widest2">Back</button>
              <button onClick={createApproved}
                style={{ backgroundColor: RED, color: "#FFFFFF" }}
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90">
                Create {countApproved(editing)} item{countApproved(editing) === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}

        {phase === "creating" && (
          <div className="py-8 text-center">
            <p className="font-medium">Creating tasks…</p>
            <p className="mt-2 text-sm text-muted">{progress.done} of {progress.total}</p>
          </div>
        )}

        {phase === "done" && (
          <div className="py-8 text-center">
            <p className="font-medium">Done — created {progress.total} item{progress.total === 1 ? "" : "s"}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function countApproved(editing: Array<{ keep: boolean; title: string; subtasks: Array<{ keep: boolean; title: string }> }>): number {
  let n = 0;
  for (const p of editing) {
    if (!p.keep || !p.title.trim()) continue;
    n++;
    n += p.subtasks.filter(s => s.keep && s.title.trim()).length;
  }
  return n;
}
