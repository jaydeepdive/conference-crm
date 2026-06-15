import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkIsClientSponsor } from "@/lib/adsplatform";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RequestBody {
  conference_id: string;
  only_unchecked?: boolean;
}

// Bulk-recheck every company + investor in a conference against the AdsPlatform.
// Returns a summary of how many were updated.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await request.json()) as RequestBody;
  if (!body.conference_id) return NextResponse.json({ error: "conference_id required" }, { status: 400 });

  // Auth: super_admin or conference_admin only
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  const { data: membership } = await supabase.from("conference_memberships")
    .select("role").eq("profile_id", user.id).eq("conference_id", body.conference_id).maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  const canBulk = profile?.is_super_admin || role === "conference_admin";
  if (!canBulk) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let companyQuery = supabase.from("companies").select("id,name,ticker,website").eq("conference_id", body.conference_id);
  let investorQuery = supabase.from("investors").select("id,firm_name,ticker,website").eq("conference_id", body.conference_id);
  if (body.only_unchecked) {
    companyQuery = companyQuery.is("tdd_last_checked_at", null);
    investorQuery = investorQuery.is("tdd_last_checked_at", null);
  }

  const [{ data: companies }, { data: investors }] = await Promise.all([companyQuery, investorQuery]);

  let updated = 0;
  let clients = 0;
  let errors = 0;
  const allErrors: string[] = [];

  // Process in small batches to respect TDD's 3s timeout per call
  async function processOne(
    type: "company" | "investor",
    id: string,
    name: string,
    ticker?: string | null,
    website?: string | null,
  ) {
    try {
      const res = await checkIsClientSponsor({
        ticker, company_name: name, website_url: website,
      });
      if (res.error) {
        errors++;
        if (allErrors.length < 3) allErrors.push(res.error);
        return;
      }
      const table = type === "company" ? "companies" : "investors";
      await supabase.from(table).update({
        is_tdd_client: res.is_client,
        tdd_match_type: res.match_type,
        tdd_company_data: res.company,
        tdd_last_checked_at: new Date().toISOString(),
      }).eq("id", id);
      updated++;
      if (res.is_client) clients++;
    } catch {
      errors++;
    }
  }

  // Companies + Investors in parallel batches of 5
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
    updated, clients, errors,
    errorSample: allErrors,
  });
}
