import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/platform/invites/sync-from-registered
 * Body: { slug: string }
 *
 * Super-admin "sync" button on the Platform Invites page. Re-runs the same
 * backfill the migration 0020 trigger does — picks up any new
 * company_contacts added since the lead was registered, plus any registered
 * leads that somehow slipped past the trigger.
 *
 * CRITICAL: creates attendee_profiles only. Does NOT send email. Operator
 * still has to hit "Send to all unsent" to actually dispatch invites.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  let body: { slug?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const admin = createServiceClient();
  const { data: conference } = await admin.from("conferences")
    .select("id, slug").eq("slug", body.slug).maybeSingle();
  if (!conference) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });

  // Count what's there before.
  const { count: beforeCount } = await admin.from("attendee_profiles")
    .select("*", { count: "exact", head: true }).eq("conference_id", conference.id);

  // Pull registered leads with usable emails.
  const [{ data: companies }, { data: investors }, { data: contacts }] = await Promise.all([
    admin.from("companies")
      .select("id, email, name, contact_name")
      .eq("conference_id", conference.id).eq("stage", "registered"),
    admin.from("investors")
      .select("id, email, firm_name, contact_name")
      .eq("conference_id", conference.id).eq("stage", "registered"),
    admin.from("company_contacts")
      .select("company_id, email, name, title, phone, companies!inner(conference_id, stage)")
      .eq("companies.conference_id", conference.id)
      .eq("companies.stage", "registered"),
  ]);

  type Row = {
    conference_id: string;
    lead_type: "company" | "investor";
    lead_id: string;
    email: string;
    full_name: string | null;
    title?: string | null;
    phone?: string | null;
  };
  const toInsert: Row[] = [];
  for (const c of companies ?? []) {
    const em = (c.email ?? "").trim().toLowerCase();
    if (!em) continue;
    toInsert.push({
      conference_id: conference.id, lead_type: "company", lead_id: c.id,
      email: em, full_name: c.contact_name ?? c.name,
    });
  }
  for (const i of investors ?? []) {
    const em = (i.email ?? "").trim().toLowerCase();
    if (!em) continue;
    toInsert.push({
      conference_id: conference.id, lead_type: "investor", lead_id: i.id,
      email: em, full_name: i.contact_name ?? i.firm_name,
    });
  }
  for (const cc of (contacts ?? []) as Array<{ company_id: string; email: string | null; name: string; title: string | null; phone: string | null }>) {
    const em = (cc.email ?? "").trim().toLowerCase();
    if (!em) continue;
    toInsert.push({
      conference_id: conference.id, lead_type: "company", lead_id: cc.company_id,
      email: em, full_name: cc.name, title: cc.title, phone: cc.phone,
    });
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, created: 0, before: beforeCount ?? 0, after: beforeCount ?? 0 });
  }

  // Deduplicate within this payload (same email twice would 409 on the
  // unique index even with ON CONFLICT in a single statement).
  const seen = new Map<string, Row>();
  for (const row of toInsert) {
    if (!seen.has(row.email)) seen.set(row.email, row);
  }

  // Supabase upsert on (conference_id, email) — on conflict do nothing.
  const { error } = await admin.from("attendee_profiles")
    .upsert(Array.from(seen.values()), { onConflict: "conference_id,email", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count: afterCount } = await admin.from("attendee_profiles")
    .select("*", { count: "exact", head: true }).eq("conference_id", conference.id);

  return NextResponse.json({
    ok: true,
    before: beforeCount ?? 0,
    after: afterCount ?? 0,
    created: (afterCount ?? 0) - (beforeCount ?? 0),
    note: "No emails sent. Use Send to all unsent to dispatch invites.",
  });
}
