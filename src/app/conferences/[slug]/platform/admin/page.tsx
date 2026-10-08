/**
 * /conferences/[slug]/platform/admin — overview with live counts.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export default async function PlatformAdminOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createServiceClient();
  const { data: conference } = await admin.from("conferences").select("id, name, public_name").eq("slug", slug).maybeSingle();
  if (!conference) { notFound(); throw new Error("unreachable"); }

  const [att, comp, inv, acc, mtg, pend] = await Promise.all([
    admin.from("attendee_profiles").select("*", { count: "exact", head: true }).eq("conference_id", conference.id),
    admin.from("attendee_profiles").select("lead_id").eq("conference_id", conference.id).eq("lead_type", "company"),
    admin.from("attendee_profiles").select("lead_id").eq("conference_id", conference.id).eq("lead_type", "investor"),
    admin.from("attendee_profiles").select("*", { count: "exact", head: true }).eq("conference_id", conference.id).not("user_id", "is", null),
    admin.from("meetings").select("*", { count: "exact", head: true }).eq("conference_id", conference.id).eq("status", "accepted"),
    admin.from("meetings").select("*", { count: "exact", head: true }).eq("conference_id", conference.id).in("status", ["proposed", "countered"]),
  ]);
  const stats: [string, number][] = [
    ["Attendees", att.count ?? 0],
    ["Logged in", acc.count ?? 0],
    ["Companies", new Set((comp.data ?? []).map(r => r.lead_id)).size],
    ["Investors", new Set((inv.data ?? []).map(r => r.lead_id)).size],
    ["Confirmed meetings", mtg.count ?? 0],
    ["Pending requests", pend.count ?? 0],
  ];
  const base = `/conferences/${slug}/platform/admin`;
  const card = "block border border-line bg-white px-5 py-4 transition-colors hover:border-brand-accent";

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">Admin</div>
      <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">{conference.public_name ?? "Above & Beyond Mining Summit"}</h1>
      <p className="mt-1 text-sm text-muted">Scottsdale, Arizona · live from the CRM</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="border border-line bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">{label}</div>
            <div className="mt-1 font-display text-3xl text-brand-accent">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href={`${base}/meetings`} className={card}>
          <div className="font-display text-xl">Meetings →</div>
          <div className="mt-1 text-sm text-muted">Schedule grid, create / edit / cancel, assign tables, auto-match.</div>
        </Link>
        <Link href={`${base}/attendees`} className={card}>
          <div className="font-display text-xl">Attendees →</div>
          <div className="mt-1 text-sm text-muted">Invites, reset passwords, and &ldquo;Preview&rdquo; the portal as any attendee.</div>
        </Link>
      </div>
    </div>
  );
}
