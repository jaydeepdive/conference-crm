import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Meeting, MeetingBlocklistEntry } from "@/lib/types";

export const runtime = "nodejs";

interface ProposalIn {
  company_id: string;
  investor_id: string;
  scheduled_time: string;
}

interface Skipped { company_id: string; investor_id: string; reason: string }

/**
 * POST /api/admin/meetings/auto-match-commit
 *
 * Super-admin only. Commits a batch of auto-match proposals as accepted
 * meetings. For each proposal: validate (not blocklisted, no slot conflict),
 * upsert the meeting row (UPDATE scheduled_time + status=accepted +
 * location=null + proposed_by='company' on conflict), and write an
 * admin_override meeting_event per committed row.
 *
 * Body: { conference_id, proposals: Array<{company_id, investor_id, scheduled_time}> }
 * Returns: { ok, created, skipped: Skipped[] }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles").select("is_super_admin, full_name, email").eq("id", user.id).single();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  let body: { conference_id?: string; proposals?: ProposalIn[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  const conferenceId = body.conference_id;
  const proposals = Array.isArray(body.proposals) ? body.proposals : [];
  if (!conferenceId) return NextResponse.json({ error: "conference_id required" }, { status: 400 });
  if (!proposals.length) return NextResponse.json({ ok: true, created: 0, skipped: [] });

  const admin = createServiceClient();

  // Load the blocklist once.
  const { data: blRaw } = await admin.from("meeting_blocklist").select("*")
    .eq("conference_id", conferenceId);
  const blocked = new Set<string>();
  for (const b of (blRaw ?? []) as MeetingBlocklistEntry[]) {
    if (b.from_lead_type === "company" && b.to_lead_type === "investor") {
      blocked.add(`${b.from_lead_id}|${b.to_lead_id}`);
    } else if (b.from_lead_type === "investor" && b.to_lead_type === "company") {
      blocked.add(`${b.to_lead_id}|${b.from_lead_id}`);
    }
  }

  // Load every existing meeting for this conference so we can detect slot
  // conflicts in-process (one round-trip rather than N).
  const { data: existingAllRaw } = await admin.from("meetings").select("*")
    .eq("conference_id", conferenceId);
  const existingAll = (existingAllRaw ?? []) as Meeting[];

  // Per-side busy map: lead_id → set of ISO scheduled times already in use
  // by an accepted meeting (not counting the pair we're placing).
  const busyCo: Record<string, Set<string>> = {};
  const busyInv: Record<string, Set<string>> = {};
  const existingByPair = new Map<string, Meeting>();
  for (const m of existingAll) {
    existingByPair.set(`${m.company_id}|${m.investor_id}`, m);
    if (m.status === "accepted" && m.scheduled_time) {
      const iso = new Date(m.scheduled_time).toISOString();
      (busyCo[m.company_id] ??= new Set()).add(iso);
      (busyInv[m.investor_id] ??= new Set()).add(iso);
    }
  }

  const skipped: Skipped[] = [];
  let created = 0;
  const actorLabel = profile.full_name ?? profile.email ?? "admin";

  for (const p of proposals) {
    if (!p.company_id || !p.investor_id || !p.scheduled_time) {
      skipped.push({ company_id: p.company_id, investor_id: p.investor_id, reason: "missing fields" });
      continue;
    }
    const pairKey = `${p.company_id}|${p.investor_id}`;
    if (blocked.has(pairKey)) {
      skipped.push({ company_id: p.company_id, investor_id: p.investor_id, reason: "blocklisted" });
      continue;
    }
    const iso = new Date(p.scheduled_time).toISOString();

    // Pretend to free the existing pair's current slot so we don't false-conflict
    // against ourselves.
    const existing = existingByPair.get(pairKey);
    if (existing?.status === "accepted" && existing.scheduled_time) {
      const prev = new Date(existing.scheduled_time).toISOString();
      busyCo[existing.company_id]?.delete(prev);
      busyInv[existing.investor_id]?.delete(prev);
    }

    if (busyCo[p.company_id]?.has(iso)) {
      skipped.push({ company_id: p.company_id, investor_id: p.investor_id, reason: "company busy at that slot" });
      // restore
      if (existing?.status === "accepted" && existing.scheduled_time) {
        const prev = new Date(existing.scheduled_time).toISOString();
        (busyCo[existing.company_id] ??= new Set()).add(prev);
        (busyInv[existing.investor_id] ??= new Set()).add(prev);
      }
      continue;
    }
    if (busyInv[p.investor_id]?.has(iso)) {
      skipped.push({ company_id: p.company_id, investor_id: p.investor_id, reason: "investor busy at that slot" });
      if (existing?.status === "accepted" && existing.scheduled_time) {
        const prev = new Date(existing.scheduled_time).toISOString();
        (busyCo[existing.company_id] ??= new Set()).add(prev);
        (busyInv[existing.investor_id] ??= new Set()).add(prev);
      }
      continue;
    }

    let meetingId: string;
    if (existing) {
      const { error: upErr } = await admin.from("meetings").update({
        scheduled_time: iso,
        status: "accepted",
        location: null,
        proposed_by: "company",
      }).eq("id", existing.id);
      if (upErr) {
        skipped.push({ company_id: p.company_id, investor_id: p.investor_id, reason: upErr.message });
        continue;
      }
      meetingId = existing.id;
      // update local busy map
      existing.scheduled_time = iso;
      existing.status = "accepted";
    } else {
      const { data: inserted, error: insErr } = await admin.from("meetings").insert({
        conference_id: conferenceId,
        company_id: p.company_id,
        investor_id: p.investor_id,
        status: "accepted",
        proposed_by: "company",
        scheduled_time: iso,
        location: null,
        notes: null,
        created_by: null,
      }).select("id").single();
      if (insErr || !inserted) {
        skipped.push({ company_id: p.company_id, investor_id: p.investor_id, reason: insErr?.message ?? "insert failed" });
        continue;
      }
      meetingId = (inserted as { id: string }).id;
    }

    (busyCo[p.company_id] ??= new Set()).add(iso);
    (busyInv[p.investor_id] ??= new Set()).add(iso);
    created++;

    await admin.from("meeting_events").insert({
      meeting_id: meetingId,
      actor_profile_id: null,
      actor_side: "admin",
      kind: "note",
      proposed_time: iso,
      body: `Auto-matched by admin (${actorLabel})`,
    });
  }

  return NextResponse.json({ ok: true, created, skipped });
}
