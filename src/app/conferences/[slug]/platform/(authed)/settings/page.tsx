/**
 * /conferences/[slug]/platform/settings — editable attendee profile fields,
 * plus a "People from {Company}" roster for company attendees, plus
 * blocked-slot toggles and the per-attendee avoid list (v6.54).
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  requirePlatformContext, leadDisplayName, slotsForPlatform, formatSlotRange,
} from "@/lib/platform";
import type {
  AttendeeBlockedSlot, AttendeeSide, Company, CompanyContact, Investor,
  MeetingBlocklistEntry,
} from "@/lib/types";
import { ProfileForm } from "./ProfileForm";
import { PlatformCompanyContacts } from "./PlatformCompanyContacts";
import { BlockedSlots, type SlotToggle } from "./BlockedSlots";
import { AvoidList, type DirectoryOption, type BlockRow } from "./AvoidList";

export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requirePlatformContext(slug);
  const supabase = await createClient();

  let contacts: CompanyContact[] = [];
  if (ctx.side === "company") {
    const { data } = await supabase.from("company_contacts").select("*")
      .eq("company_id", (ctx.lead as Company).id);
    contacts = (data ?? []) as CompanyContact[];
  }

  const entityName = leadDisplayName(ctx.lead, ctx.side);
  const otherSide: AttendeeSide = ctx.side === "company" ? "investor" : "company";

  // Blocked slots for this lead.
  const { data: blockedRows } = await supabase.from("attendee_blocked_slots")
    .select("*")
    .eq("conference_id", ctx.conference.id)
    .eq("lead_type", ctx.side)
    .eq("lead_id", ctx.attendee.lead_id);
  const blockedSet = new Set<string>(
    ((blockedRows ?? []) as AttendeeBlockedSlot[]).map(b => new Date(b.slot_time).toISOString()),
  );

  const slots = slotsForPlatform(ctx.conference).filter(s => !s.isLunch);
  const slotToggles: SlotToggle[] = slots.map(s => ({
    iso: s.start.toISOString(),
    label: formatSlotRange(s.start, s.end, ctx.conference.timezone),
    blocked: blockedSet.has(s.start.toISOString()),
  }));

  // Blocklist rows (from = me).
  const { data: blocklistRows } = await supabase.from("meeting_blocklist")
    .select("*")
    .eq("conference_id", ctx.conference.id)
    .eq("from_lead_type", ctx.side)
    .eq("from_lead_id", ctx.attendee.lead_id);
  const blocklist = (blocklistRows ?? []) as MeetingBlocklistEntry[];

  // Directory for the OTHER side (name + id).
  const otherTable = otherSide === "company" ? "companies" : "investors";
  const orderCol = otherSide === "company" ? "name" : "firm_name";
  const { data: peersRaw } = await supabase.from(otherTable)
    .select(otherSide === "company" ? "id, name" : "id, firm_name")
    .eq("conference_id", ctx.conference.id)
    .order(orderCol);
  type PeerRow = { id: string; name?: string | null; firm_name?: string | null };
  const options: DirectoryOption[] = ((peersRaw ?? []) as PeerRow[]).map(p => ({
    id: p.id,
    name: (otherSide === "company" ? p.name : p.firm_name) || "—",
  }));
  const nameById = new Map(options.map(o => [o.id, o.name]));
  const rows: BlockRow[] = blocklist.map(b => ({
    id: b.id,
    to_lead_type: b.to_lead_type,
    to_lead_id: b.to_lead_id,
    to_name: nameById.get(b.to_lead_id) ?? "—",
    reason: b.reason,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Edit how you appear to other attendees.</p>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Your profile</h2>
        <p className="text-xs text-slate-500">
          Email <span className="font-medium">{ctx.attendee.email}</span> is your sign-in and can&rsquo;t be changed here.
        </p>
        <ProfileForm attendee={{
          id: ctx.attendee.id,
          full_name: ctx.attendee.full_name,
          title: ctx.attendee.title,
          phone: ctx.attendee.phone,
          about: ctx.attendee.about,
        }} />
      </section>

      {ctx.side === "company" && (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">People attending from {entityName}</h2>
          <p className="mt-1 text-xs text-slate-500">
            These names show up on the other party&rsquo;s meeting cards when they view a confirmed meeting with you.
          </p>
          <PlatformCompanyContacts companyId={(ctx.lead as Company).id} contacts={contacts} />
        </section>
      )}

      {ctx.side === "investor" && (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">How companies see you</h2>
          <p className="mt-1 text-xs text-slate-500">
            Your display name and bio above are what shows up in the companies&rsquo; directory.
          </p>
        </section>
      )}

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Your availability</h2>
        <p className="mt-1 text-xs text-slate-500">
          Toggle any slot to <span className="font-medium">Blocked</span>. Other attendees won&rsquo;t be able to
          request a meeting with you at that time.
        </p>
        <BlockedSlots slug={slug} slots={slotToggles} />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Avoid list</h2>
        <p className="mt-1 text-xs text-slate-500">
          {ctx.side === "company"
            ? "Investors you don't want us pairing you with."
            : "Companies you don't want us pairing you with."}
          {" "}They won&rsquo;t be able to request a meeting with you, and we&rsquo;ll flag the pairing for admins.
        </p>
        <AvoidList
          slug={slug}
          otherSide={otherSide}
          options={options as { id: string; name: string }[]}
          rows={rows}
        />
        <p className="mt-4 text-xs text-slate-500">
          Need more context on who&rsquo;s who?{" "}
          <Link href={`/conferences/${slug}/platform/directory`} className="text-slate-900 underline">
            Browse the directory
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
