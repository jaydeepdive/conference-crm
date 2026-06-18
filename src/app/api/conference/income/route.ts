import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Server-to-server endpoint the Hub calls to pull income figures for a conference's P&L.
 * Gated by a shared secret (x-api-key) — does NOT use Supabase Auth.
 *
 * Auth: header `x-api-key: <CRM_API_KEY>`
 * Query: `?conference_id=<slug>`
 * Response: 200 { invoiced: number, received: number }
 *
 *  invoiced = sum of all invoice totals for the conference
 *  received = sum of amount_paid across companies + investors (the actual money in)
 */
export async function GET(request: Request) {
  // 1. Auth
  const incomingKey = request.headers.get("x-api-key");
  const expected = process.env.CRM_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: "CRM_API_KEY not configured" }, { status: 503 });
  }
  if (incomingKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("conference_id");
  if (!slug) {
    return NextResponse.json({ error: "conference_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Resolve slug → UUID
  const { data: conference } = await supabase
    .from("conferences").select("id").eq("slug", slug).maybeSingle();

  if (!conference) {
    return NextResponse.json({ invoiced: 0, received: 0 });
  }

  // Pull figures in parallel
  const [{ data: invoices }, { data: companies }, { data: investors }] = await Promise.all([
    supabase.from("invoices").select("total,status").eq("conference_id", conference.id),
    supabase.from("companies").select("amount_paid").eq("conference_id", conference.id),
    supabase.from("investors").select("amount_paid").eq("conference_id", conference.id),
  ]);

  const invoiced = (invoices ?? []).reduce((a, r) => a + Number(r.total ?? 0), 0);
  const receivedFromLeads = [
    ...(companies ?? []),
    ...(investors ?? []),
  ].reduce((a, r) => a + Number(r.amount_paid ?? 0), 0);

  return NextResponse.json({
    invoiced,
    received: receivedFromLeads,
    // Aliases the Hub may accept
    total_invoiced: invoiced,
    total_paid: receivedFromLeads,
    paid: receivedFromLeads,
  });
}
