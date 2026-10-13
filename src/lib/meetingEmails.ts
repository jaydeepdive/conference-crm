/**
 * Meeting notification emails (Resend). Fired when an attendee requests a
 * meeting or proposes a different time. Goes to every attendee on the OTHER
 * side (all named people for that company / investor).
 *
 * Guarded by conferences.meeting_emails_enabled — OFF until the organizer
 * flips it on in the admin console. Never throws.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { brandedEmail, sendResend } from "@/lib/resend";

type Kind = "request" | "counter";

function slotLabel(start: Date, minutes: number, tz: string): string {
  const end = new Date(start.getTime() + minutes * 60_000);
  const t = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(start);
  return `${day} · ${t(start)} – ${t(end)} (Arizona time)`;
}

export async function notifyMeeting(opts: {
  meetingId: string; kind: Kind; actorAttendeeId: string; origin: string; note?: string | null;
}): Promise<{ sent: number; skipped?: string }> {
  try {
    const svc = createServiceClient();
    const { data: m } = await svc.from("meetings").select("*").eq("id", opts.meetingId).maybeSingle();
    if (!m) return { sent: 0, skipped: "no-meeting" };
    const { data: conf } = await svc.from("conferences").select("*").eq("id", m.conference_id).maybeSingle();
    if (!conf) return { sent: 0, skipped: "no-conference" };
    if (!conf.meeting_emails_enabled) return { sent: 0, skipped: "disabled" };

    const { data: actor } = await svc.from("attendee_profiles").select("*").eq("id", opts.actorAttendeeId).maybeSingle();
    if (!actor) return { sent: 0, skipped: "no-actor" };
    const actorSide = actor.lead_type as "company" | "investor";
    const otherSide = actorSide === "company" ? "investor" : "company";
    const otherLeadId = otherSide === "company" ? m.company_id : m.investor_id;
    const actorLeadId = actorSide === "company" ? m.company_id : m.investor_id;

    const [{ data: co }, { data: inv }, { data: recipients }] = await Promise.all([
      svc.from("companies").select("name").eq("id", m.company_id).maybeSingle(),
      svc.from("investors").select("firm_name, contact_name").eq("id", m.investor_id).maybeSingle(),
      svc.from("attendee_profiles").select("id, email, full_name")
        .eq("conference_id", m.conference_id).eq("lead_type", otherSide).eq("lead_id", otherLeadId),
    ]);
    const actorOrg = actorSide === "company"
      ? (co?.name ?? "A presenting company")
      : (inv?.firm_name || inv?.contact_name || "An investor");
    void actorLeadId;

    const tz = conf.timezone ?? "America/Phoenix";
    const when = m.proposed_time ? slotLabel(new Date(m.proposed_time), conf.meeting_slot_minutes ?? 25, tz) : "Time to be confirmed";
    const confName = conf.public_name ?? "Above & Beyond Mining Summit";
    const url = `${opts.origin}/conferences/${conf.slug}/platform/meetings/${m.id}`;
    const who = actor.full_name ? `${actor.full_name} (${actorOrg})` : actorOrg;

    const heading = opts.kind === "request" ? "New meeting request" : "New time proposed";
    const lead = opts.kind === "request"
      ? `<strong>${escapeHtml(who)}</strong> would like to meet with you during the 1-on-1 meetings at ${escapeHtml(confName)}.`
      : `<strong>${escapeHtml(who)}</strong> has proposed a different time for your 1-on-1 meeting.`;
    const details: [string, string][] = [["From", who], ["When", when]];
    if (opts.note?.trim()) details.push(["Note", opts.note.trim().slice(0, 500)]);

    let sent = 0;
    for (const r of recipients ?? []) {
      if (!r.email) continue;
      const first = r.full_name ? String(r.full_name).split(" ")[0] : "";
      const { html, text } = brandedEmail({
        heading,
        greeting: first ? `Hi ${first},` : "Hello,",
        paragraphs: [lead, "Accept, decline or suggest another time from your schedule."],
        details,
        buttonLabel: "View request",
        url,
        preheader: opts.kind === "request" ? `${actorOrg} requested a meeting: ${when}` : `${actorOrg} proposed a new time: ${when}`,
        footnote: "Sign in with the email this message was sent to.",
      });
      try {
        await sendResend({
          to: r.email,
          subject: opts.kind === "request" ? `Meeting request from ${actorOrg}` : `${actorOrg} proposed a new meeting time`,
          html, text,
        });
        sent++;
      } catch (e) {
        console.error("[meeting-email] send failed", r.email, e);
      }
    }
    return { sent };
  } catch (e) {
    console.error("[meeting-email] failed", e);
    return { sent: 0, skipped: "error" };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] ?? c));
}
