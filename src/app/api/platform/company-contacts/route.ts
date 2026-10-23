/**
 * POST /api/platform/company-contacts — a company attendee manages the people
 * attending from their company (portal Settings). Server-side so attendee
 * logins never touch the table directly.
 *  { slug, action: "create", name, title?, email?, phone? }
 *  { slug, action: "update", id, name, title?, email?, phone? }
 *  { slug, action: "delete", id }
 * Contacts with an email automatically become portal attendees (DB sync).
 * No emails are sent.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { findActingAttendee } from "@/lib/portal-api";

export const runtime = "nodejs";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = await request.json().catch(() => ({})) as Record<string, string | undefined>;
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", b.slug ?? "").maybeSingle();
  if (!conf) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });
  const me = await findActingAttendee(sb, user.id, conf.id as string);
  if (!me || me.lead_type !== "company") return NextResponse.json({ error: "Only company attendees can manage their team." }, { status: 403 });
  const companyId = me.lead_id;

  const name = (b.name ?? "").trim();
  const email = (b.email ?? "").trim().toLowerCase() || null;
  const fields = { name, title: (b.title ?? "").trim() || null, email, phone: (b.phone ?? "").trim() || null };

  if (b.action === "create" || b.action === "update") {
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (email && !EMAIL_RE.test(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
    if (email) {
      const { data: clash } = await svc.from("attendee_profiles").select("lead_type, lead_id")
        .eq("conference_id", conf.id).ilike("email", email).maybeSingle();
      if (clash && !(clash.lead_type === "company" && clash.lead_id === companyId))
        return NextResponse.json({ error: "That email is already registered to another attendee." }, { status: 409 });
    }
  }

  if (b.action === "create") {
    const { error } = await svc.from("company_contacts").insert({ company_id: companyId, ...fields });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { data: row } = await svc.from("company_contacts").select("id, company_id, email").eq("id", b.id).maybeSingle();
  if (!row || row.company_id !== companyId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.action === "update") {
    // You can't change or remove your own sign-in email here.
    if (me.email && row.email && row.email.toLowerCase() === me.email.toLowerCase() && email !== me.email.toLowerCase())
      return NextResponse.json({ error: "That's your sign-in email — it can't be changed here." }, { status: 400 });
    const { error } = await svc.from("company_contacts").update(fields).eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "delete") {
    if (me.email && row.email && row.email.toLowerCase() === me.email.toLowerCase())
      return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
    const { error } = await svc.from("company_contacts").delete().eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
