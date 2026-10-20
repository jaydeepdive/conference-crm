/**
 * POST /api/platform/messages  { slug, other_lead_id, body }
 * Send a direct message from the acting attendee's company/investor to a
 * registered party on the other side. Refused if either side has the other
 * on their do-not-meet list.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { findActingAttendee } from "@/lib/portal-api";
import { attendingLeadIds } from "@/lib/platform";
import { pairFor, pairBlocked, markThreadRead } from "@/lib/messages";
import { notifyMessage } from "@/lib/meetingEmails";
import { PORTAL_ORIGIN } from "@/lib/portalDomain";
import type { AttendeeSide } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { slug?: string; other_lead_id?: string; body?: string };
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "Message is too long (4,000 characters max)." }, { status: 400 });
  if (!body.other_lead_id || !body.slug) return NextResponse.json({ error: "Missing recipient" }, { status: 400 });

  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", body.slug).maybeSingle();
  if (!conf) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });

  const me = await findActingAttendee(supabase, user.id, conf.id as string);
  if (!me) return NextResponse.json({ error: "Not an attendee of this conference" }, { status: 403 });
  const mySide = me.lead_type as AttendeeSide;
  const otherSide: AttendeeSide = mySide === "company" ? "investor" : "company";

  if (!(await attendingLeadIds(conf.id as string, otherSide)).has(body.other_lead_id))
    return NextResponse.json({ error: "They aren't registered for this conference." }, { status: 400 });
  if (await pairBlocked(conf.id as string, mySide, me.lead_id, body.other_lead_id))
    return NextResponse.json({ error: "Messaging isn't available between you and this attendee." }, { status: 403 });

  const pair = pairFor(mySide, me.lead_id, body.other_lead_id);
  const { data: inserted, error } = await svc.from("portal_messages").insert({
    conference_id: conf.id, ...pair, sender_side: mySide, sender_attendee_id: me.id,
    sender_name: me.full_name ?? null, body: text,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await markThreadRead(me.id, mySide, me.lead_id, body.other_lead_id);
  await notifyMessage({ conferenceId: conf.id as string, senderAttendeeId: me.id, ...pair, senderSide: mySide, text, origin: PORTAL_ORIGIN });

  return NextResponse.json({ ok: true, id: inserted.id });
}
