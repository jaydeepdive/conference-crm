/**
 * Greedy auto-matcher for conference 1-on-1 meetings.
 *
 * Given the pool of companies + investors in a conference, existing accepted
 * meetings (busy map), per-attendee self-blocked slots, and a hard-skip
 * blocklist, propose a set of new accepted meetings that fit the day's 14
 * slots without any double-booking.
 *
 * This is intentionally simple — we iterate slots in time order and, for
 * each slot, greedily pick candidate pairs where both sides are free. Pair
 * ordering is biased so attendees with fewer current meetings go first, so
 * utilization spreads out across the room.
 *
 * Fine for ~20 companies × ~60 investors × 14 slots; runs in a server
 * render pass in a few ms.
 */

export interface MatchLead {
  id: string;
  name: string;
}

export interface MatchInput {
  companies: MatchLead[];
  investors: MatchLead[];
  /** All existing accepted meetings as (company_id, investor_id, slot_iso). */
  acceptedMeetings: Array<{ company_id: string; investor_id: string; slot_iso: string }>;
  /** Per-side blocked slots the attendee set themselves. */
  blockedSlots: Array<{ lead_type: "company" | "investor"; lead_id: string; slot_iso: string }>;
  /** Bidirectional avoid list — pair never gets proposed. */
  blocklist: Array<{
    from_lead_type: "company" | "investor"; from_lead_id: string;
    to_lead_type: "company" | "investor"; to_lead_id: string;
  }>;
  /** 14 slot ISOs in time order (lunch excluded). */
  slotIsos: string[];
  /** Shuffle seed for Regenerate — different seed = different pair ordering. */
  seed?: number;
  /** If true, re-propose on top of a cleared slate (does not actually clear
   *  existing rows — the API commit does the delete). Here it means "ignore
   *  the acceptedMeetings busy map except for blocklist/self-blocks". */
  replaceAll?: boolean;
}

export interface Proposal {
  company_id: string;
  investor_id: string;
  company_name: string;
  investor_name: string;
  slot_iso: string;
}

export interface MatchResult {
  proposals: Proposal[];
  /** How many meetings each attendee ends up with (new + existing kept). */
  companyMeetingCount: Record<string, number>;
  investorMeetingCount: Record<string, number>;
}

function pairKey(a: string, b: string): string { return `${a}|${b}`; }

/** Deterministic PRNG so Regenerate is reproducible per-seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function autoMatch(input: MatchInput): MatchResult {
  const { companies, investors, slotIsos } = input;
  const seed = input.seed ?? 1;
  const rand = mulberry32(seed);

  // Blocklist: bidirectional pair set for company↔investor pairs.
  const blocked = new Set<string>();
  for (const b of input.blocklist) {
    // Only care about company<->investor direction; blocklist can be stored
    // either way around.
    let coId: string | null = null;
    let invId: string | null = null;
    if (b.from_lead_type === "company" && b.to_lead_type === "investor") {
      coId = b.from_lead_id; invId = b.to_lead_id;
    } else if (b.from_lead_type === "investor" && b.to_lead_type === "company") {
      coId = b.to_lead_id; invId = b.from_lead_id;
    }
    if (coId && invId) blocked.add(pairKey(coId, invId));
  }

  // Existing accepted pairs — skip these candidates.
  const existingPairs = new Set<string>();
  // Busy maps: per lead → set of slot ISOs already in use.
  const busyCompany: Record<string, Set<string>> = {};
  const busyInvestor: Record<string, Set<string>> = {};
  // Running meeting count per attendee (used to spread utilization).
  const companyCount: Record<string, number> = {};
  const investorCount: Record<string, number> = {};

  if (!input.replaceAll) {
    for (const m of input.acceptedMeetings) {
      existingPairs.add(pairKey(m.company_id, m.investor_id));
      (busyCompany[m.company_id] ??= new Set()).add(m.slot_iso);
      (busyInvestor[m.investor_id] ??= new Set()).add(m.slot_iso);
      companyCount[m.company_id] = (companyCount[m.company_id] ?? 0) + 1;
      investorCount[m.investor_id] = (investorCount[m.investor_id] ?? 0) + 1;
    }
  }

  // Self-blocked slots fold into the busy map.
  for (const bs of input.blockedSlots) {
    if (bs.lead_type === "company") (busyCompany[bs.lead_id] ??= new Set()).add(bs.slot_iso);
    else (busyInvestor[bs.lead_id] ??= new Set()).add(bs.slot_iso);
  }

  // Candidate pairs = every (co, inv) not already matched and not blocklisted.
  interface Cand { coId: string; coName: string; invId: string; invName: string }
  const candidatesAll: Cand[] = [];
  const shuffledCos = shuffle(companies, rand);
  const shuffledInvs = shuffle(investors, rand);
  for (const c of shuffledCos) {
    for (const i of shuffledInvs) {
      const k = pairKey(c.id, i.id);
      if (existingPairs.has(k)) continue;
      if (blocked.has(k)) continue;
      candidatesAll.push({ coId: c.id, coName: c.name, invId: i.id, invName: i.name });
    }
  }

  const proposals: Proposal[] = [];

  for (const slotIso of slotIsos) {
    // Snapshot remaining candidates — the ones that haven't been assigned yet.
    // We greedily place a candidate if both sides are free in this slot.
    // Sort candidates so attendees with the fewest meetings so far go first;
    // break ties using the pre-shuffled order (stable sort).
    const sorted = candidatesAll
      .filter(c => !proposals.some(p => p.company_id === c.coId && p.investor_id === c.invId))
      .map((c, idx) => ({ c, idx }))
      .sort((a, b) => {
        const scoreA = (companyCount[a.c.coId] ?? 0) + (investorCount[a.c.invId] ?? 0);
        const scoreB = (companyCount[b.c.coId] ?? 0) + (investorCount[b.c.invId] ?? 0);
        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.idx - b.idx;
      })
      .map(x => x.c);

    for (const cand of sorted) {
      if (busyCompany[cand.coId]?.has(slotIso)) continue;
      if (busyInvestor[cand.invId]?.has(slotIso)) continue;
      // Place.
      proposals.push({
        company_id: cand.coId,
        investor_id: cand.invId,
        company_name: cand.coName,
        investor_name: cand.invName,
        slot_iso: slotIso,
      });
      (busyCompany[cand.coId] ??= new Set()).add(slotIso);
      (busyInvestor[cand.invId] ??= new Set()).add(slotIso);
      companyCount[cand.coId] = (companyCount[cand.coId] ?? 0) + 1;
      investorCount[cand.invId] = (investorCount[cand.invId] ?? 0) + 1;
    }
  }

  // Make sure every attendee has an entry in the final count maps.
  for (const c of companies) companyCount[c.id] ??= 0;
  for (const i of investors) investorCount[i.id] ??= 0;

  return {
    proposals,
    companyMeetingCount: companyCount,
    investorMeetingCount: investorCount,
  };
}
