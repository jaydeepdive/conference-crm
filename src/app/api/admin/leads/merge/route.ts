import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/leads/merge
 *
 * Merge two leads of the same type in the same conference into one.
 *
 * Body: {
 *   lead_type: "company" | "investor",
 *   winner_id: uuid,   // the row that survives
 *   loser_id:  uuid,   // the row that gets deleted after everything is reassigned
 *   field_overrides?: Partial<lead>   // optional: any fields to explicitly set on the winner
 * }
 *
 * What happens on the winner row:
 *   - For every scalar field, if the winner's value is null/empty and the loser
 *     has a value, we copy the loser's value in.
 *   - amount_due / amount_paid: unchanged (they're derived from invoices).
 *   - notes: concatenated (loser notes appended with a "Merged from …" header).
 *   - `field_overrides`: explicit final say — whatever you pass wins.
 *
 * What gets reassigned from loser → winner (loser's rows get their lead_id updated):
 *   - invoices              (lead_type + lead_id)
 *   - lead_notes            (lead_type + lead_id)
 *   - lead_comps            (lead_type + lead_id)
 *   - activity_log          (lead_type + lead_id)
 *   - attendee_profiles     (lead_type + lead_id)
 *   - meetings              (company_id or investor_id, depending on type)
 *   - sent_emails.recipients[].lead_id (JSONB — we do NOT rewrite; the audit
 *     trail keeps the historical id).
 *
 * Then the loser row is deleted. The invoice-sync trigger will re-run on the
 * winner because we touched its invoices, so amount_due / amount_paid stay
 * accurate.
 *
 * Requires: super_admin.
 */

type LeadType = "company" | "investor";
type Body = {
  lead_type?: LeadType;
  winner_id?: string;
  loser_id?: string;
  field_overrides?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: "Only super admins can merge leads." }, { status: 403 });
  }

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 }); }

  const { lead_type, winner_id, loser_id, field_overrides } = body;
  if (!lead_type || !["company","investor"].includes(lead_type)) {
    return NextResponse.json({ error: "lead_type must be 'company' or 'investor'" }, { status: 400 });
  }
  if (!winner_id || !loser_id) {
    return NextResponse.json({ error: "winner_id and loser_id are both required" }, { status: 400 });
  }
  if (winner_id === loser_id) {
    return NextResponse.json({ error: "winner_id and loser_id must differ" }, { status: 400 });
  }

  const admin = createServiceClient();
  const table = lead_type === "company" ? "companies" : "investors";

  // Fetch both rows
  const [{ data: winner, error: wErr }, { data: loser, error: lErr }] = await Promise.all([
    admin.from(table).select("*").eq("id", winner_id).maybeSingle(),
    admin.from(table).select("*").eq("id", loser_id).maybeSingle(),
  ]);
  if (wErr) return NextResponse.json({ error: `Failed to load winner: ${wErr.message}` }, { status: 500 });
  if (lErr) return NextResponse.json({ error: `Failed to load loser:  ${lErr.message}` }, { status: 500 });
  if (!winner) return NextResponse.json({ error: `Winner ${winner_id} not found in ${table}` }, { status: 404 });
  if (!loser)  return NextResponse.json({ error: `Loser  ${loser_id}  not found in ${table}` }, { status: 404 });
  if (winner.conference_id !== loser.conference_id) {
    return NextResponse.json({ error: "Leads must be in the same conference" }, { status: 400 });
  }

  // -----------------------------------------------------------------------
  // Compose the merged field payload for the winner.
  // -----------------------------------------------------------------------
  //
  // Rules:
  //   - Do not overwrite winner values that are already non-empty.
  //   - Skip id, conference_id, created_at (immutable), and the numeric
  //     invoice-derived columns (amount_due, amount_paid, payment_status)
  //     — the trigger keeps those in sync after we reassign invoices below.
  //   - notes: concatenate.
  //   - field_overrides: applied last, always win.

  const IMMUTABLE = new Set([
    "id","conference_id","created_at","updated_at",
    "amount_due","amount_paid","payment_status",
    "tdd_last_checked_at",
  ]);

  const merged: Record<string, unknown> = {};
  for (const [key, loserVal] of Object.entries(loser)) {
    if (IMMUTABLE.has(key)) continue;
    if (key === "notes") continue; // handled below
    const winnerVal = (winner as Record<string, unknown>)[key];
    const winnerEmpty =
      winnerVal === null || winnerVal === undefined || winnerVal === "" ||
      (Array.isArray(winnerVal) && winnerVal.length === 0);
    if (winnerEmpty && loserVal !== null && loserVal !== undefined && loserVal !== "") {
      merged[key] = loserVal;
    }
  }

  // Notes: keep winner's, append loser's (deduped) under a header.
  const winnerNotes = ((winner as { notes?: string | null }).notes ?? "").trim();
  const loserNotes  = ((loser  as { notes?: string | null }).notes ?? "").trim();
  const combinedNotes = [
    winnerNotes,
    loserNotes ? `\n\n— merged from ${lead_type} ${loser_id} on ${new Date().toISOString().slice(0,10)} —\n${loserNotes}` : "",
  ].filter(Boolean).join("");
  if (combinedNotes && combinedNotes !== winnerNotes) merged.notes = combinedNotes;

  // Explicit overrides — always win, even over the "winner not empty" rule.
  if (field_overrides && typeof field_overrides === "object") {
    for (const [k, v] of Object.entries(field_overrides)) {
      if (IMMUTABLE.has(k)) continue;
      merged[k] = v;
    }
  }

  // -----------------------------------------------------------------------
  // Apply the merged fields (if any changed).
  // -----------------------------------------------------------------------
  if (Object.keys(merged).length > 0) {
    const { error } = await admin.from(table).update(merged).eq("id", winner_id);
    if (error) return NextResponse.json({ error: `Winner update failed: ${error.message}` }, { status: 500 });
  }

  // -----------------------------------------------------------------------
  // Reassign child rows from loser → winner.
  // -----------------------------------------------------------------------
  //
  // Some of these tables have UNIQUE constraints (e.g. attendee_profiles
  // is unique per conference+email). If a loser attendee's email already
  // exists on the winner side, we drop the loser row rather than error.

  const reassigned: Record<string, number> = {};

  async function bulkReassign(tableName: string, uniqueColumns: string[] = []): Promise<void> {
    if (uniqueColumns.length > 0) {
      // Find loser rows whose unique key already exists on the winner side; delete those.
      // We select all columns (typed as unknown) rather than a dynamic column list
      // because Supabase's generated types can't parse a runtime-built select string.
      const { data: loserRowsRaw } = await admin
        .from(tableName)
        .select("*")
        .eq("lead_type", lead_type)
        .eq("lead_id", loser_id);
      const loserRows = (loserRowsRaw ?? []) as Array<Record<string, unknown>>;

      for (const row of loserRows) {
        let q = admin.from(tableName).select("id")
          .eq("lead_type", lead_type).eq("lead_id", winner_id);
        for (const col of uniqueColumns) q = q.eq(col, row[col]);
        const dupWinnerRes = await q.maybeSingle();
        const dupWinner = dupWinnerRes.data as { id: string } | null;
        if (dupWinner) {
          await admin.from(tableName).delete().eq("id", row.id as string);
        }
      }
    }
    const { error, count } = await admin
      .from(tableName)
      .update({ lead_id: winner_id }, { count: "exact" })
      .eq("lead_type", lead_type)
      .eq("lead_id", loser_id);
    if (error) throw new Error(`${tableName}: ${error.message}`);
    reassigned[tableName] = count ?? 0;
  }

  async function bulkReassignByColumn(tableName: string, column: string): Promise<void> {
    const { error, count } = await admin
      .from(tableName)
      .update({ [column]: winner_id }, { count: "exact" })
      .eq(column, loser_id);
    if (error) throw new Error(`${tableName}.${column}: ${error.message}`);
    reassigned[tableName] = count ?? 0;
  }

  try {
    await bulkReassign("invoices");
    await bulkReassign("lead_notes");
    await bulkReassign("lead_comps");
    await bulkReassign("activity_log");
    await bulkReassign("attendee_profiles", ["email"]);
    if (lead_type === "company") {
      await bulkReassignByColumn("meetings", "company_id");
    } else {
      await bulkReassignByColumn("meetings", "investor_id");
    }
  } catch (e) {
    return NextResponse.json({
      error: `Reassignment failed: ${e instanceof Error ? e.message : String(e)}. Winner may have been partially updated; please re-run.`,
    }, { status: 500 });
  }

  // -----------------------------------------------------------------------
  // Delete the loser row.
  // -----------------------------------------------------------------------
  const { error: delErr } = await admin.from(table).delete().eq("id", loser_id);
  if (delErr) {
    return NextResponse.json({
      error: `Loser delete failed: ${delErr.message}. Child rows have already been reassigned; you can retry by manually deleting the loser row in Supabase.`,
    }, { status: 500 });
  }

  // Audit trail
  await admin.from("activity_log").insert({
    conference_id: winner.conference_id,
    lead_type,
    lead_id: winner_id,
    lead_name: (winner as { name?: string; firm_name?: string }).name ?? (winner as { firm_name?: string }).firm_name ?? "",
    action: "Merged duplicate",
    notes: `Merged in duplicate lead ${loser_id} (${(loser as { name?: string; firm_name?: string }).name ?? (loser as { firm_name?: string }).firm_name ?? "(no name)"}). Reassigned: ${
      Object.entries(reassigned).map(([k,v]) => `${k}=${v}`).join(", ")
    }.`,
  });

  return NextResponse.json({
    ok: true,
    winner_id,
    loser_id,
    reassigned,
    merged_fields: Object.keys(merged),
  });
}
