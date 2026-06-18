/**
 * Project Hub (PM platform) integration.
 * Documented endpoints: projects, tasks, suggest-tasks, project (full).
 * Helpers for undocumented endpoints (notes) are exposed with graceful fallback.
 */

export type HubTaskStatus = "todo" | "in_progress" | "done" | string;
export type HubTaskPriority = "low" | "medium" | "high" | string;
export type HubTaskSource = "crm" | "hub" | "ai" | "telegram" | string;

export interface HubTask {
  id: string;
  title: string;
  notes?: string | null;
  status: HubTaskStatus;
  priority?: HubTaskPriority | null;
  due_date?: string | null;
  start_date?: string | null;
  source?: HubTaskSource;
  conference_id?: string;
  assignee?: string | null;
  parent_id?: string | null;
  category?: string | null;
  comments?: HubComment[];
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface HubComment {
  author: string;
  body: string;
  created_at: string;
}

export interface HubProject {
  id: string;
  title?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  status?: string;
  owner?: string | null;
  owner_email?: string | null;
  conference_id?: string;
  url?: string;
  start_date?: string | null;
  target_date?: string | null;
  budget?: number | null;
  progress?: { done: number; total: number; pct: number };
  schedule?: "on_track" | "behind" | string;
  created_at?: string;
  updated_at?: string;
}

export interface HubCategory { id: string; name: string; position: number }

export interface HubTeamMember { id: string; name: string; email: string }

export interface HubExpense {
  description: string;
  vendor?: string;
  category?: string;
  amount: number;
  status: string;
  incurred_on?: string;
  task_id?: string | null;
  receipt_url?: string | null;
}

export interface HubFinancials {
  budget?: number | null;
  costs: { paid: number; committed: number; planned: number; total: number };
  income: { received: number; invoiced: number };
  net: number;
  remaining_budget: number;
  expenses: HubExpense[];
  income_entries?: Array<Record<string, unknown>>;
}

export interface FullProjectResponse {
  project: HubProject;
  categories: HubCategory[];
  tasks: HubTask[];
  team: HubTeamMember[];
  financials: HubFinancials;
}

export interface HubTasksResponse {
  project: HubProject | null;
  tasks: HubTask[];
}

export interface HubNote {
  id: string;
  body: string;
  created_at: string;
  source?: string;
  author?: string | null;
}

export interface HubSuggestion {
  category?: string;
  title: string;
  notes?: string;
  priority?: HubTaskPriority;
  subtasks?: Array<{ title: string; notes?: string; priority?: HubTaskPriority }>;
}

export interface HubSuggestionsResponse { tasks: HubSuggestion[] }

class HubError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function hub<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.HUB_BASE_URL;
  const key = process.env.HUB_API_KEY;
  if (!base || !key) throw new HubError(503, "Hub not configured (HUB_BASE_URL / HUB_API_KEY missing)");

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let msg = `Hub ${path} → ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new HubError(res.status, msg);
  }
  return (await res.json()) as T;
}

// --- THE WHOLE PROJECT (preferred — replaces individual queries) ---

export function getFullProject(conferenceSlug: string, opts: { includeComments?: boolean; includeDone?: boolean } = {}): Promise<FullProjectResponse> {
  const qs = new URLSearchParams({ conference_id: conferenceSlug });
  if (opts.includeComments === false) qs.set("include_comments", "0");
  if (opts.includeDone === false) qs.set("include_done", "0");
  return hub<FullProjectResponse>(`/api/external/project?${qs.toString()}`);
}

// --- Discovery / project link (still used as a fallback) ---

export async function getLinkedProject(conferenceSlug: string): Promise<HubProject | null> {
  try {
    const data = await hub<{ projects?: HubProject[]; project?: HubProject | null }>(
      `/api/external/projects?conference_id=${encodeURIComponent(conferenceSlug)}`,
    );
    if (data.project) return data.project;
    if (data.projects && data.projects.length > 0) return data.projects[0];
    return null;
  } catch (e) {
    if (e instanceof HubError && e.status === 404) return null;
    throw e;
  }
}

// --- Lightweight tasks-only fetch (still used by the dashboard "To Do" panel) ---

export function getConferenceTasks(conferenceSlug: string, includeDone = false): Promise<HubTasksResponse> {
  return hub<HubTasksResponse>(
    `/api/external/tasks?conference_id=${encodeURIComponent(conferenceSlug)}${includeDone ? "&include_done=1" : ""}`,
  );
}

// --- Mutations ---

export function createConferenceTask(
  conferenceSlug: string,
  title: string,
  extra: Partial<Pick<HubTask, "notes" | "priority" | "due_date" | "status" | "category" | "parent_id">> = {},
): Promise<HubTask> {
  return hub<HubTask>(`/api/external/tasks`, {
    method: "POST",
    body: JSON.stringify({ conference_id: conferenceSlug, title, ...extra }),
  });
}

export function updateTask(id: string, patch: Partial<Pick<HubTask, "title" | "notes" | "status" | "priority" | "due_date">>): Promise<HubTask> {
  return hub<HubTask>(`/api/external/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteTask(id: string): Promise<{ ok: boolean }> {
  return hub<{ ok: boolean }>(`/api/external/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function suggestTasks(conferenceSlug: string, instruction: string): Promise<HubSuggestionsResponse> {
  return hub<HubSuggestionsResponse>(`/api/external/suggest-tasks`, {
    method: "POST",
    body: JSON.stringify({ conference_id: conferenceSlug, instruction }),
  });
}

// --- Optional / undocumented (silent fallback) ---

export async function getConferenceNotes(conferenceSlug: string): Promise<HubNote[]> {
  try {
    const data = await hub<{ notes?: HubNote[] }>(
      `/api/external/notes?conference_id=${encodeURIComponent(conferenceSlug)}`,
    );
    return data.notes ?? [];
  } catch { return []; }
}

export { HubError };
