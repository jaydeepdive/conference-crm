/**
 * Duplicate-lead detection.
 *
 * Given a list of leads (all companies OR all investors within one conference),
 * return pairs that are likely duplicates. We do not auto-merge — we surface
 * candidates for a human to review in the /admin/duplicates page.
 *
 * Match signals (ranked strongest → weakest):
 *   1. Exact email match (case-insensitive)        → confidence "high"
 *   2. Normalized organization/name exact match    → confidence "high"
 *   3. Normalized org name Levenshtein <= 2         → confidence "medium"
 *   4. Same phone (digits only, last 10)            → confidence "medium"
 *   5. Same domain in email                         → confidence "low"
 *
 * The strongest signal wins; each pair is emitted once with all matching
 * reasons attached.
 */

export interface DupLead {
  id: string;
  name: string;                     // org name (companies.name or investors.firm_name)
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export type DupConfidence = "high" | "medium" | "low";

export interface DupPair {
  a: DupLead;
  b: DupLead;
  confidence: DupConfidence;
  reasons: string[];
}

/** Lowercase, strip corporate suffixes, collapse whitespace + punctuation. */
export function normalizeOrgName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/\b(inc|inc\.|incorporated|corp|corp\.|corporation|ltd|ltd\.|limited|llc|l\.l\.c\.|llp|plc|co|co\.|company|group|holdings|capital|partners|lp|l\.p\.)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Digits only, last 10 (drops country code) — so +1 416-555-0134 == 4165550134. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D+/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

/** Domain portion of an email, lowercased. */
export function emailDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  const at = raw.indexOf("@");
  if (at < 0) return "";
  return raw.slice(at + 1).toLowerCase().trim();
}

/** Iterative Levenshtein — O(m*n) but m/n are short org names so this is fine. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

const CONF_RANK: Record<DupConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * Public / free-mail domains — matching on these is much weaker signal
 * than matching on a corporate domain, so we don't emit low-confidence
 * pairs from these.
 */
const GENERIC_DOMAINS = new Set([
  "gmail.com","googlemail.com","yahoo.com","yahoo.ca","yahoo.co.uk",
  "outlook.com","hotmail.com","hotmail.ca","live.com","icloud.com",
  "me.com","aol.com","protonmail.com","proton.me","msn.com",
]);

/**
 * Return every likely-duplicate pair in the input list, best-confidence first.
 * Each pair is emitted at most once (a<b by id to canonicalize).
 */
export function findDuplicates(leads: DupLead[]): DupPair[] {
  const pairs = new Map<string, DupPair>();

  const upsert = (a: DupLead, b: DupLead, confidence: DupConfidence, reason: string) => {
    const [x, y] = a.id < b.id ? [a, b] : [b, a];
    const key = `${x.id}|${y.id}`;
    const existing = pairs.get(key);
    if (!existing) {
      pairs.set(key, { a: x, b: y, confidence, reasons: [reason] });
      return;
    }
    existing.reasons.push(reason);
    if (CONF_RANK[confidence] > CONF_RANK[existing.confidence]) {
      existing.confidence = confidence;
    }
  };

  // Pre-index by each match key so we skip the full O(n^2) scan when possible.
  const byEmail = new Map<string, DupLead[]>();
  const byNorm = new Map<string, DupLead[]>();
  const byPhone = new Map<string, DupLead[]>();
  const byDomain = new Map<string, DupLead[]>();

  for (const lead of leads) {
    if (lead.email) {
      const e = lead.email.toLowerCase().trim();
      (byEmail.get(e) ?? byEmail.set(e, []).get(e)!).push(lead);
      const dom = emailDomain(lead.email);
      if (dom && !GENERIC_DOMAINS.has(dom)) {
        (byDomain.get(dom) ?? byDomain.set(dom, []).get(dom)!).push(lead);
      }
    }
    const norm = normalizeOrgName(lead.name);
    if (norm.length >= 2) {
      (byNorm.get(norm) ?? byNorm.set(norm, []).get(norm)!).push(lead);
    }
    const ph = normalizePhone(lead.phone);
    if (ph.length === 10) {
      (byPhone.get(ph) ?? byPhone.set(ph, []).get(ph)!).push(lead);
    }
  }

  // 1. Exact email — high
  for (const group of byEmail.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      upsert(group[i], group[j], "high", `Same email: ${group[i].email}`);
    }
  }

  // 2. Exact normalized name — high
  for (const [norm, group] of byNorm.entries()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      upsert(group[i], group[j], "high", `Same name (normalized: "${norm}")`);
    }
  }

  // 3. Fuzzy name — Levenshtein <= 2 on the normalized form — medium.
  //    Only bother comparing across DIFFERENT normalized keys; within-key
  //    was already handled above. And skip when either name is too short
  //    (edit distance 2 vs "hp" is meaningless).
  const normKeys = Array.from(byNorm.keys()).filter(k => k.length >= 4);
  for (let i = 0; i < normKeys.length; i++) {
    for (let j = i + 1; j < normKeys.length; j++) {
      const ka = normKeys[i], kb = normKeys[j];
      if (Math.abs(ka.length - kb.length) > 2) continue;
      if (levenshtein(ka, kb) > 2) continue;
      for (const a of byNorm.get(ka)!) for (const b of byNorm.get(kb)!) {
        upsert(a, b, "medium", `Similar names: "${a.name}" vs "${b.name}"`);
      }
    }
  }

  // 4. Same phone — medium
  for (const group of byPhone.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      upsert(group[i], group[j], "medium", `Same phone: ${group[i].phone}`);
    }
  }

  // 5. Same corporate email domain — low
  for (const [dom, group] of byDomain.entries()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      upsert(group[i], group[j], "low", `Same email domain: @${dom}`);
    }
  }

  return Array.from(pairs.values()).sort((x, y) => {
    const c = CONF_RANK[y.confidence] - CONF_RANK[x.confidence];
    if (c !== 0) return c;
    return y.reasons.length - x.reasons.length;
  });
}
