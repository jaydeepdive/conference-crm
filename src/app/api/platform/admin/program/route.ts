/**
 * POST /api/platform/admin/program — super admin edits the event program.
 *  { action: "save", conference_id, id?, day, start_time, end_time?, title, note?, location? }
 *  { action: "delete", id }
 *  { action: "publish", conference_id, published: boolean }
 * Never sends email.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const svc = createServiceClient();
  const t = (v: unknown) => (typeof v === "string" ? v.trim() : "") || null;

  if (b.action === "save") {
    const day = t(b.day), start = t(b.start_time), end = t(b.end_time), title = t(b.title);
    if (!b.conference_id || !day || !DAY.test(day)) return NextResponse.json({ error: "Pick a day." }, { status: 400 });
    if (!start || !TIME.test(start)) return NextResponse.json({ error: "Enter a start time." }, { status: 400 });
    if (end && !TIME.test(end)) return NextResponse.json({ error: "End time isn't valid." }, { status: 400 });
    if (end && end <= start) return NextResponse.json({ error: "End time must be after the start time." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Enter a title." }, { status: 400 });
    const row = { conference_id: b.conference_id, day, start_time: start, end_time: end, title,
      note: t(b.note), location: t(b.location), updated_at: new Date().toISOString() };
    const { error } = b.id
      ? await svc.from("conference_program_items").update(row).eq("id", b.id)
      : await svc.from("conference_program_items").insert(row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "delete") {
    if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const { error } = await svc.from("conference_program_items").delete().eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "publish") {
    if (!b.conference_id) return NextResponse.json({ error: "Missing conference" }, { status: 400 });
    const { error } = await svc.from("conferences").update({ program_published: !!b.published }).eq("id", b.conference_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
