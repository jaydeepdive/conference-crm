/**
 * POST   /api/platform/blocked-slots — upsert a self-blocked slot.
 * DELETE /api/platform/blocked-slots?slot_time=<iso>   OR  ?id=<uuid>
 *
 * Body (POST):
 *   { slot_time: ISO, reason?, slug?, lead_type?, lead_id? }
 *   If lead_type/lead_id omitted, derive from caller's attendee_profile.
 *   Super admins may act on behalf of another lead by passing them.
 *
 * RLS enforces the attendee-owner / super-admin check for callers acting as
 * themselves; we only reach for the service client when the super-admin
 * override path is used (acting on behalf of another lead).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { slotsForPlatform } from "@/lib/platform";
import type { AttendeeSide, Conference } from "@/lib/types";

export const runtime = "nodejs";

interface PostBody {
  slot_time?: string;
  reason?: string | null;
  slug?: string;
  lead_type?: AttendeeSide;
  lead_id?: string;
}

async function resolveActor(slug?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  const isSuperAdmin = !!(profile as { is_super_admin?: boolean } | null)?.is_super_admin;

  let conference: Conference | null = null;
  if (slug) {
    const { data: conf } = await supabase.from("conferences").select("*").eq("slug", slug).maybeSingle();
    if (!conf) return { error: NextResponse.json({ error: "Unknown conference" }, { status: 404 }) };
    conference = conf as Conference;
  }

  let attendeeQ = supabase.from("attendee_profiles")
    .select("id, lead_type, lead_id, conference_id")
    .eq("user_id", user.id);
  if (conference) attendeeQ = attendeeQ.eq("conference_id", conference.id);
  const { data: attendees } = await attendeeQ.limit(1);
  const attendee = (attendees ?? [])[0] ?? null;

  return { supabase, user, isSuperAdmin, conference, attendee };
}

export async function POST(request: Request) {
  let body: PostBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  if (!body.slot_time) return NextResponse.json({ error: "Missing slot_time" }, { status: 400 });
  const slotDate = new Date(body.slot_time);
  if (isNaN(slotDate.getTime())) return NextResponse.json({ error: "Invalid slot_time" }, { status: 400 });

  const r = await resolveActor(body.slug);
  if ("error" in r) return r.error;
  const { supabase, isSuperAdmin, attendee } = r;
  let { conference } = r;

  // Determine (lead_type, lead_id, conference_id).
  let leadType: AttendeeSide;
  let leadId: string;
  let conferenceId: string;
  let overriding = false;

  if (body.lead_type && body.lead_id) {
    if (!["company", "investor"].includes(body.lead_type))
      return NextResponse.json({ error: "Invalid lead_type" }, { status: 400 });
    leadType = body.lead_type;
    leadId = body.lead_id;
    // Confirm the caller either represents this lead or is a super admin.
    const representsSelf = !!attendee && attendee.lead_type === leadType && attendee.lead_id === leadId;
    if (!representsSelf && !isSuperAdmin) {
      return NextResponse.json({ error: "Not allowed to block for that lead." }, { status: 403 });
    }
    overriding = !representsSelf;
    if (!conference) {
      if (!attendee) return NextResponse.json({ error: "No conference context." }, { status: 400 });
      const { data: conf } = await supabase.from("conferences").select("*").eq("id", attendee.conference_id).maybeSingle();
      conference = conf as Conference | null;
    }
    if (!conference) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });
    conferenceId = conference.id;
  } else {
    if (!attendee) return NextResponse.json({ error: "Not an attendee of this conference" }, { status: 403 });
    leadType = attendee.lead_type as AttendeeSide;
    leadId = attendee.lead_id;
    conferenceId = attendee.conference_id;
    if (!conference) {
      const { data: conf } = await supabase.from("conferences").select("*").eq("id", conferenceId).maybeSingle();
      conference = conf as Conference | null;
    }
    if (!conference) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });
  }

  // Validate slot_time against the conference's 14 slot ISOs.
  const slots = slotsForPlatform(conference);
  const want = slotDate.getTime();
  const matched = slots.find(s => s.start.getTime() === want && !s.isLunch);
  if (!matched) return NextResponse.json({ error: "slot_time does not match any conference slot" }, { status: 400 });

  const client = overriding ? createServiceClient() : supabase;
  const payload = {
    conference_id: conferenceId,
    lead_type: leadType,
    lead_id: leadId,
    slot_time: matched.start.toISOString(),
    reason: body.reason ?? null,
    created_by: r.user.id,
  };
  const { data, error } = await client.from("attendee_blocked_slots")
    .upsert(payload, { onConflict: "conference_id,lead_type,lead_id,slot_time" })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const slotTime = url.searchParams.get("slot_time");
  const slug = url.searchParams.get("slug") ?? undefined;
  const leadType = url.searchParams.get("lead_type") as AttendeeSide | null;
  const leadId = url.searchParams.get("lead_id");

  const r = await resolveActor(slug);
  if ("error" in r) return r.error;
  const { supabase, isSuperAdmin, attendee } = r;

  if (id) {
    // RLS alone can authorize this when the caller represents the lead.
    const { error } = await supabase.from("attendee_blocked_slots").delete().eq("id", id);
    if (error) {
      if (isSuperAdmin) {
        const admin = createServiceClient();
        const { error: e2 } = await admin.from("attendee_blocked_slots").delete().eq("id", id);
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (!slotTime) return NextResponse.json({ error: "Missing id or slot_time" }, { status: 400 });
  const slotDate = new Date(slotTime);
  if (isNaN(slotDate.getTime())) return NextResponse.json({ error: "Invalid slot_time" }, { status: 400 });

  // Resolve target lead.
  let targetType: AttendeeSide;
  let targetId: string;
  let conferenceId: string;
  let overriding = false;

  if (leadType && leadId) {
    if (!["company", "investor"].includes(leadType))
      return NextResponse.json({ error: "Invalid lead_type" }, { status: 400 });
    targetType = leadType;
    targetId = leadId;
    const representsSelf = !!attendee && attendee.lead_type === targetType && attendee.lead_id === targetId;
    if (!representsSelf && !isSuperAdmin)
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    overriding = !representsSelf;
    if (!attendee && !isSuperAdmin)
      return NextResponse.json({ error: "No conference context." }, { status: 400 });
    conferenceId = attendee?.conference_id ?? "";
    if (!conferenceId && slug) {
      const { data: conf } = await supabase.from("conferences").select("id").eq("slug", slug).maybeSingle();
      if (!conf) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });
      conferenceId = conf.id as string;
    }
    if (!conferenceId) return NextResponse.json({ error: "No conference context." }, { status: 400 });
  } else {
    if (!attendee) return NextResponse.json({ error: "Not an attendee of this conference" }, { status: 403 });
    targetType = attendee.lead_type as AttendeeSide;
    targetId = attendee.lead_id;
    conferenceId = attendee.conference_id;
  }

  const client = overriding ? createServiceClient() : supabase;
  const { error } = await client.from("attendee_blocked_slots").delete()
    .eq("conference_id", conferenceId)
    .eq("lead_type", targetType)
    .eq("lead_id", targetId)
    .eq("slot_time", slotDate.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
