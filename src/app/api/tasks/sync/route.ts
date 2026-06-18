import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConferenceTasks, createConferenceTask, updateTask, deleteTask, suggestTasks, HubError } from "@/lib/hub";

export const runtime = "nodejs";

async function authUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function handleHubError(e: unknown) {
  if (e instanceof HubError) return err(e.message, e.status);
  return err(e instanceof Error ? e.message : "Hub call failed", 500);
}

// GET /api/tasks/sync?conference_id=<slug>&include_done=1
export async function GET(request: Request) {
  if (!(await authUser())) return err("Unauthenticated", 401);
  const { searchParams } = new URL(request.url);
  const conferenceId = searchParams.get("conference_id");
  if (!conferenceId) return err("conference_id required");
  const includeDone = searchParams.get("include_done") === "1";
  try {
    return NextResponse.json(await getConferenceTasks(conferenceId, includeDone));
  } catch (e) { return handleHubError(e); }
}

// POST /api/tasks/sync — create or AI-suggest
// Body: { action: "create", conference_id, title, ...extras } or { action: "suggest", conference_id, instruction }
export async function POST(request: Request) {
  if (!(await authUser())) return err("Unauthenticated", 401);
  const body = await request.json();
  try {
    if (body.action === "suggest") {
      if (!body.conference_id || !body.instruction) return err("conference_id + instruction required");
      return NextResponse.json(await suggestTasks(body.conference_id, body.instruction));
    }
    // default: create — pass through category, parent_id, etc.
    if (!body.conference_id || !body.title) return err("conference_id + title required");
    const { conference_id, title, ...extra } = body;
    return NextResponse.json(await createConferenceTask(conference_id, title, extra as Parameters<typeof createConferenceTask>[2]));
  } catch (e) { return handleHubError(e); }
}

// PATCH /api/tasks/sync?id=<task_id>
export async function PATCH(request: Request) {
  if (!(await authUser())) return err("Unauthenticated", 401);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return err("id required");
  const patch = await request.json();
  try {
    return NextResponse.json(await updateTask(id, patch));
  } catch (e) { return handleHubError(e); }
}

// DELETE /api/tasks/sync?id=<task_id>
export async function DELETE(request: Request) {
  if (!(await authUser())) return err("Unauthenticated", 401);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return err("id required");
  try {
    return NextResponse.json(await deleteTask(id));
  } catch (e) { return handleHubError(e); }
}
