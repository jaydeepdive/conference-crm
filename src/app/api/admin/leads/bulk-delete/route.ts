import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/leads/bulk-delete
 * Body: { lead_type: "company" | "investor", ids: string[] }
 *
 * Deletes the given lead rows in one shot. Child rows (invoices, notes,
 * comps, activity_log, attendee_profiles, meetings) go with them via
 * ON DELETE CASCADE. Purpose: sweep spam signups off the intake API
 * without clicking Delete on each row.
 *
 * Auth: super_admin. Also enforces same-conference safety — if the IDs
 * span more than one conference we bail rather than risk over-deletion.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("is_super_admin, full_name, email").eq("id", user.id).single();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  let body: { lead_type?: string; ids?: string[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  const leadType = body.lead_type;
  if (leadType !== "company" && leadType !== "investor") {
    return NextResponse.json({ error: "lead_type must be 'company' or 'investor'" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: "Refusing to delete more than 500 rows in one call" }, { status: 400 });
  }

  const admin = createServiceClient();
  const table = leadType === "company" ? "companies" : "investors";
  const nameField = leadType === "company" ? "name" : "firm_name";

  // Read what we're about to delete — for the audit log + sanity check.
  const { data: existing, error: qErr } = await admin.from(table)
    .select(`id, conference_id, ${nameField}`)
    .in("id", ids);
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const rows = (existing ?? []) as Array<{ id: string; conference_id: string; [k: string]: unknown }>;
  if (rows.length === 0) {
    return NextResponse.json({ error: "None of the given ids exist in that table" }, { status: 404 });
  }

  const conferenceIds = Array.from(new Set(rows.map(r => r.conference_id)));
  if (conferenceIds.length !== 1) {
    return NextResponse.json({
      error: `Rows span ${conferenceIds.length} conferences. Delete one conference at a time.`,
    }, { status: 400 });
  }
  const conferenceId = conferenceIds[0];

  const { error: delErr } = await admin.from(table).delete().in("id", rows.map(r => r.id));
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Single audit-log entry summarizing the sweep. Individual per-row entries
  // would just be noise for bulk deletes.
  const names = rows.slice(0, 10).map(r => String(r[nameField] ?? "(no name)"));
  const nameSummary = names.join(", ") + (rows.length > 10 ? `, +${rows.length - 10} more` : "");
  await admin.from("activity_log").insert({
    conference_id: conferenceId,
    lead_type: leadType,
    lead_id: rows[0].id,   // any surviving reference — the actual rows are gone
    lead_name: `Bulk delete (${rows.length} ${leadType}s)`,
    action: `Bulk-deleted ${rows.length} ${leadType} lead${rows.length === 1 ? "" : "s"}`,
    notes: `Deleted by ${profile.full_name ?? profile.email}. Names: ${nameSummary}`,
    user_id: user.id,
  });

  return NextResponse.json({ ok: true, deleted: rows.length });
}
