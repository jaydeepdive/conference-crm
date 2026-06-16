import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkIsClientSponsor } from "@/lib/adsplatform";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RequestBody {
  conference_id: string;
  /** When true: re-sync (a) leads never checked AND (b) leads currently not flagged where last check is > 1h old.
   *  When false: re-sync every lead in the conference (force full refresh).  */
  only_stale?: boolean;
}

// Threshold for retrying "not a client" results — 1 hour stops API hammering but
// catches cases where the user thought a lead was a client but the lookup just hadn't run yet.
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await request.json()) as RequestBody;
  if (!body.conference_id) return NextResponse.json({ error: "conference_id required" }, { status: 400 });

  // Allow any team/finance/recruiter to trigger this (it's safe — it only checks against a public-ish API)
  const { data: hasAccess } = await supabase.rpc("has_conference_access", { c_id: body.conference_id });
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  // Build the queries
  let companyQuery = supabase.from("companies")
    .select("id,name,ticker,website,is_tdd_client,tdd_last_checked_at")
    .eq("conference_id", body.conference_id);
  let investorQuery = supabase.from("investors")
    .select("id,firm_name,ticker,website,is_tdd_client,tdd_last_checked_at")
    .eq("conference_id", body.conference_id);

  if (body.only_stale !== false) {
    // Default: only check leads needing attention.
    // Logic: never-checked OR (not-flagged AND last-checked > 1h ago)
    companyQuery = companyQuery.or(`tdd_last_checked_at.is.null,and(is_tdd_client.eq.false,tdd_last_checked_at.lt.${staleCutoff})`);
    investorQuery = investorQuery.or(`tdd_last_checked_at.is.null,and(is_tdd_client.eq.false,tdd_last_checked_at.lt.${staleCutoff})`);
  }

  const [{ data: companies }, { data: investors }] = await Promise.all([companyQuery, investorQuery]);

  let updated = 0;
  let clients = 0;
  let errors = 0;
  let companiesProcessed = 0;
  let investorsProcessed = 0;
  const allErrors: string[] = [];

  async function processOne(
    type: "company" | "investor",
    id: string,
    name: string,
    ticker?: string | null,
    website?: string | null,
  ) {
    try {
      const res = await checkIsClientSponsor({ ticker, company_name: name, website_url: website });
      if (res.error) {
        errors++;
        if (allErrors.length < 3) allErrors.push(res.error);
        return; // Don't persist on error — leave the row's last_checked alone so next sync retries
      }
      const table = type === "company" ? "companies" : "investors";
      const { error: updateErr } = await supabase.from(table).update({
        is_tdd_client: res.is_client,
        tdd_match_type: res.match_type,
        tdd_company_data: res.company,
        tdd_last_checked_at: new Date().toISOString(),
      }).eq("id", id);
      if (updateErr) {
        errors++;
        if (allErrors.length < 3) allErrors.push(`DB update failed for ${type} ${id}: ${updateErr.message}`);
        return;
      }
      updated++;
      if (res.is_client) clients++;
      if (type === "company") companiesProcessed++; else investorsProcessed++;
    } catch (e) {
      errors++;
      if (allErrors.length < 3) allErrors.push(e instanceof Error ? e.message : "unknown error");
    }
  }

  const allLeads = [
    ...(companies ?? []).map(c => ({ type: "company" as const, id: c.id, name: c.name, ticker: c.ticker, website: c.website })),
    ...(investors ?? []).map(i => ({ type: "investor" as const, id: i.id, name: i.firm_name, ticker: i.ticker, website: i.website })),
  ];

  const batchSize = 5;
  for (let i = 0; i < allLeads.length; i += batchSize) {
    const batch = allLeads.slice(i, i + batchSize);
    await Promise.all(batch.map(l => processOne(l.type, l.id, l.name, l.ticker, l.website)));
  }

  return NextResponse.json({
    total: allLeads.length,
    companiesProcessed,
    investorsProcessed,
    updated, clients, errors,
    errorSample: allErrors,
  });
}
