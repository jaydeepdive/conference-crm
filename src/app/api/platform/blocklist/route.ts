/**
 * POST   /api/platform/blocklist — add a blocklist entry (from = me → to).
 * DELETE /api/platform/blocklist?id=<uuid>
 *
 * Body (POST):
 *   { to_lead_type, to_lead_id, reason?, slug?, from_lead_type?, from_lead_id? }
 *   If from_* omitted, derive from caller's attendee_profile. Super admins
 *   may act on behalf of another lead.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AttendeeSide } from "@/lib/types";

export const runtime = "nodejs";

interface PostBody {
  to_lead_type?: AttendeeSide;
  to_lead_id?: string;
  reason?: string | null;
  slug?: string;
  from_lead_type?: AttendeeSide;
  from_lead_id?: string;
}

async function resolveActor(slug?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  const isSuperAdmin = !!(profile as { is_super_admin?: boolean } | null)?.is_super_admin;

  let conferenceId: string | null = null;
  if (slug) {
    const { data: conf } = await supabase.from("conferences").select("id").eq("slug", slug).maybeSingle();
    if (!conf) return { error: NextResponse.json({ error: "Unknown conference" }, { status: 404 }) };
    conferenceId = conf.id as string;
  }

  let attendeeQ = supabase.from("attendee_profiles")
    .select("id, lead_type, lead_id, conference_id")
    .eq("user_id", user.id);
  if (conferenceId) attendeeQ = attendeeQ.eq("conference_id", conferenceId);
  const { data: attendees } = await attendeeQ.limit(1);
  const attendee = (attendees ?? [])[0] ?? null;

  return { supabase, user, isSuperAdmin, conferenceId, attendee };
}

export async function POST(request: Request) {
  let body: PostBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  if (!body.to_lead_type || !["company", "investor"].includes(body.to_lead_type))
    return NextResponse.json({ error: "to_lead_type must be 'company' or 'investor'" }, { status: 400 });
  if (!body.to_lead_id) return NextResponse.json({ error: "Missing to_lead_id" }, { status: 400 });

  const r = await resolveActor(body.slug);
  if ("error" in r) return r.error;
  const { supabase, isSuperAdmin, attendee } = r;
  let conferenceId = r.conferenceId;

  let fromType: AttendeeSide;
  let fromId: string;
  let overriding = false;

  if (body.from_lead_type && body.from_lead_id) {
    if (!["company", "investor"].includes(body.from_lead_type))
      return NextResponse.json({ error: "Invalid from_lead_type" }, { status: 400 });
    fromType = body.from_lead_type;
    fromId = body.from_lead_id;
    const representsSelf = !!attendee && attendee.lead_type === fromType && attendee.lead_id === fromId;
    if (!representsSelf && !isSuperAdmin)
      return NextResponse.json({ error: "Not allowed to block on behalf of that lead." }, { status: 403 });
    overriding = !representsSelf;
    if (!conferenceId) conferenceId = attendee?.conference_id ?? null;
  } else {
    if (!attendee) return NextResponse.json({ error: "Not an attendee of this conference" }, { status: 403 });
    fromType = attendee.lead_type as AttendeeSide;
    fromId = attendee.lead_id;
    conferenceId = attendee.conference_id;
  }

  if (!conferenceId) return NextResponse.json({ error: "No conference context." }, { status: 400 });

  if (fromType === body.to_lead_type && fromId === body.to_lead_id)
    return NextResponse.json({ error: "Cannot block yourself." }, { status: 400 });

  const client = overriding ? createServiceClient() : supabase;
  const { data, error } = await client.from("meeting_blocklist")
    .upsert({
      conference_id: conferenceId,
      from_lead_type: fromType,
      from_lead_id: fromId,
      to_lead_type: body.to_lead_type,
      to_lead_id: body.to_lead_id,
      reason: body.reason ?? null,
      created_by: r.user.id,
    }, { onConflict: "conference_id,from_lead_type,from_lead_id,to_lead_type,to_lead_id" })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const r = await resolveActor();
  if ("error" in r) return r.error;
  const { supabase, isSuperAdmin } = r;

  const { error } = await supabase.from("meeting_blocklist").delete().eq("id", id);
  if (error) {
    if (isSuperAdmin) {
      const admin = createServiceClient();
      const { error: e2 } = await admin.from("meeting_blocklist").delete().eq("id", id);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
