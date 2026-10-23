/**
 * POST /api/platform/admin/day1 — super admin.
 *  { action: "details", conference_id, kind, title, when_text, location, details }
 *  { action: "assign", ids: string[], activity: "site_visit"|"golf"|"none"|null }
 * Never sends email.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const svc = createServiceClient();

  if (b.action === "details") {
    if (!["site_visit", "golf"].includes(String(b.kind)) || !b.conference_id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const t = (v: unknown) => (typeof v === "string" ? v.trim() : "") || null;
    const { error } = await svc.from("conference_activities").upsert({
      conference_id: b.conference_id, kind: b.kind,
      title: t(b.title) ?? (b.kind === "golf" ? "Golf tournament" : "Site visit"),
      when_text: t(b.when_text), location: t(b.location), details: t(b.details),
      updated_at: new Date().toISOString(),
    }, { onConflict: "conference_id,kind" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "assign") {
    const ids = Array.isArray(b.ids) ? (b.ids as string[]) : [];
    const act = b.activity == null || b.activity === "" ? null : String(b.activity);
    if (ids.length === 0) return NextResponse.json({ error: "No one selected" }, { status: 400 });
    if (act && !["site_visit", "golf", "none"].includes(act)) return NextResponse.json({ error: "Unknown activity" }, { status: 400 });
    const { error } = await svc.from("attendee_profiles").update({ day1_activity: act }).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
