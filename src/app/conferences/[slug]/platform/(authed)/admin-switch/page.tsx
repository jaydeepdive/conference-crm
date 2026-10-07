/**
 * Super-admin "view platform as" picker. Lists every attendee_profile in
 * this conference; clicking one sets the impersonation cookie and sends
 * the admin back to the platform dashboard.
 */
import { notFound, redirect } from "next/navigation";
import { resolvePlatformContext } from "@/lib/platform";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminSwitchClient } from "./AdminSwitchClient";

export const dynamic = "force-dynamic";

export default async function AdminSwitchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await resolvePlatformContext(slug);
  if (!result || result.kind !== "ok") { notFound(); throw new Error("unreachable"); }
  const ctx = result.ctx;
  if (!ctx.isAdmin) {
    redirect(`/conferences/${slug}/platform`);
    throw new Error("unreachable");
  }

  const admin = createServiceClient();
  const [{ data: attendees }, { data: companies }, { data: investors }] = await Promise.all([
    admin.from("attendee_profiles").select("*")
      .eq("conference_id", ctx.conference.id)
      .order("lead_type", { ascending: true })
      .order("created_at", { ascending: true }),
    admin.from("companies").select("id,name").eq("conference_id", ctx.conference.id),
    admin.from("investors").select("id,firm_name").eq("conference_id", ctx.conference.id),
  ]);

  type AttRow = { id: string; lead_type: string; lead_id: string; full_name: string | null; email: string; user_id: string | null };
  const list = (attendees ?? []) as AttRow[];
  const companyName = new Map((companies ?? []).map(c => [c.id, c.name as string]));
  const investorName = new Map((investors ?? []).map(i => [i.id, i.firm_name as string]));

  const rows = list.map(a => ({
    id: a.id,
    full_name: a.full_name ?? "(no name)",
    email: a.email,
    entity: a.lead_type === "company" ? (companyName.get(a.lead_id) ?? "—") : (investorName.get(a.lead_id) ?? "—"),
    side: a.lead_type as "company" | "investor",
    accepted: a.user_id !== null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">View platform as…</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pick any attendee to see the platform through their eyes. Nothing you do while impersonating
          sends email on their behalf unless you explicitly trigger it.
        </p>
      </div>

      <AdminSwitchClient slug={slug} rows={rows} />
    </div>
  );
}
