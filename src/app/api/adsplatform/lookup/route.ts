import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkIsClientSponsor } from "@/lib/adsplatform";

export const runtime = "nodejs";

interface RequestBody {
  conference_id: string;
  lead_type?: "company" | "investor";
  lead_id?: string;
  ticker?: string;
  company_name?: string;
  website_url?: string;
  persist?: boolean;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await request.json()) as RequestBody;

  // Verify the user has access to the conference referenced by this lookup
  if (body.conference_id) {
    const { data: hasAccess } = await supabase.rpc("has_conference_access", { c_id: body.conference_id });
    if (!hasAccess) return NextResponse.json({ error: "No access to this conference" }, { status: 403 });
  }

  const result = await checkIsClientSponsor({
    ticker: body.ticker,
    company_name: body.company_name,
    website_url: body.website_url,
  });

  // Optionally cache the result on the lead row
  if (body.persist && body.lead_type && body.lead_id) {
    const table = body.lead_type === "company" ? "companies" : "investors";
    await supabase.from(table).update({
      is_tdd_client: result.is_client,
      tdd_match_type: result.match_type,
      tdd_company_data: result.company,
      tdd_last_checked_at: new Date().toISOString(),
    }).eq("id", body.lead_id).eq("conference_id", body.conference_id);
  }

  return NextResponse.json(result);
}
