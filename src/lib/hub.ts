/**
 * Project Hub (PM platform) integration.
 * Two-way sync: tasks created here appear in the Hub (source = "crm"),
 * tasks created in the Hub appear here. Linking a Hub project to a CRM conference
 * is done in the Hub UI, keyed on the conference slug.
 */

export type HubTaskStatus = "todo" | "in_progress" | "done" | string;
export type HubTaskPriority = "low" | "medium" | "high" | string;
export type HubTaskSource = "crm" | "hub" | "ai" | string;

export interface HubTask {
  id: string;
  title: string;
  notes?: string | null;
  status: HubTaskStatus;
  priority?: HubTaskPriority | null;
  due_date?: string | null;
  source?: HubTaskSource;
  conference_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HubProject {
  id: string;
  title?: string;
  name?: string;
  conference_id?: string;
}

export interface HubTasksResponse {
  project: HubProject | null;
  tasks: HubTask[];
}

export interface HubSuggestion {
  title: string;
  notes?: string;
  priority?: HubTaskPriority;
}

export interface HubSuggestionsResponse {
  tasks: HubSuggestion[];
}

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

// --- Project / link discovery ---

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

// --- Tasks ---

export function getConferenceTasks(conferenceSlug: string, includeDone = false): Promise<HubTasksResponse> {
  return hub<HubTasksResponse>(
    `/api/external/tasks?conference_id=${encodeURIComponent(conferenceSlug)}${includeDone ? "&include_done=1" : ""}`,
  );
}

export function createConferenceTask(
  conferenceSlug: string,
  title: string,
  extra: Partial<Pick<HubTask, "notes" | "priority" | "due_date" | "status">> = {},
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

// --- AI suggestions ---

export function suggestTasks(conferenceSlug: string, instruction: string): Promise<HubSuggestionsResponse> {
  return hub<HubSuggestionsResponse>(`/api/external/suggest-tasks`, {
    method: "POST",
    body: JSON.stringify({ conference_id: conferenceSlug, instruction }),
  });
}

export { HubError };
