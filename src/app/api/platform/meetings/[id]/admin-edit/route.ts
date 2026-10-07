import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * POST /api/platform/meetings/[id]/admin-edit
 * Body (any subset): { scheduled_time?: ISO, location?: string|null, status?: "accepted"|"cancelled" }
 *
 * Super-admin only. Forcibly edits a meeting without the propose/accept
 * dance — used by the operator to resolve conflicts, assign tables, cancel
 * on behalf of a party that can't log in, etc. Writes an admin-origin
 * meeting_event so the history reflects the override.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles").select("is_super_admin, full_name, email").eq("id", user.id).single();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  const { id } = await params;
  let body: { scheduled_time?: string; location?: string | null; status?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  const admin = createServiceClient();
  const { data: existing } = await admin.from("meetings").select("*").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const notes: string[] = [];

  if (typeof body.scheduled_time === "string") {
    patch.scheduled_time = body.scheduled_time;
    // Force the meeting into accepted state when we're assigning a time —
    // nothing else makes sense from an admin override.
    patch.status = "accepted";
    notes.push(`scheduled_time → ${body.scheduled_time}`);
  }
  if (body.location !== undefined) {
    patch.location = body.location;
    notes.push(`location → ${body.location ?? "null"}`);
  }
  if (body.status === "cancelled") {
    patch.status = "cancelled";
    notes.push("status → cancelled");
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error: upErr } = await admin.from("meetings").update(patch).eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Audit event — kind "note" because the meeting_events enum doesn't have
  // an "admin" kind. The body makes the override obvious in the history.
  await admin.from("meeting_events").insert({
    meeting_id: id,
    actor_profile_id: null,
    actor_side: "admin",
    kind: body.status === "cancelled" ? "cancel" : "note",
    proposed_time: body.scheduled_time ?? null,
    body: `Admin override by ${profile.full_name ?? profile.email}: ${notes.join(", ")}`,
  });

  return NextResponse.json({ ok: true, patch });
}
