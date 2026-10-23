/**
 * Admin console → Company profiles. Every registered company's portal
 * profile (category, primary metal, website, blurb) in one place.
 */
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { attendingLeadIds } from "@/lib/platform";
import { ProfilesClient, type ProfileRow } from "./ProfilesClient";

export const dynamic = "force-dynamic";

export default async function ProfilesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", slug).maybeSingle();
  if (!conf) { notFound(); throw new Error("unreachable"); }
  const attending = await attendingLeadIds(conf.id as string, "company");
  const { data: cos } = await svc.from("companies")
    .select("id, name, website, about, category, primary_metal")
    .eq("conference_id", conf.id).order("name");
  const rows = ((cos ?? []) as ProfileRow[]).filter(c => attending.has(c.id));
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">Admin</div>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">Company profiles</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          What investors see in the portal directory for each registered company. Category and metal also power the directory filters.
        </p>
      </div>
      <ProfilesClient rows={rows} />
    </div>
  );
}
