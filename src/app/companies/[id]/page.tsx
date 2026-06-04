import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeadEditor } from "@/components/LeadEditor";
import { ActivityFeed } from "@/components/ActivityFeed";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const [{ data: company }, { data: profiles }, { data: activity }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).single(),
    supabase.from("profiles").select("*"),
    supabase.from("activity_log").select("*").eq("lead_type", "company").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);

  if (!company) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/companies" className="text-sm text-gray-500 hover:text-gray-700">← Companies</Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{company.name}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LeadEditor kind="company" profiles={profiles ?? []} currentUserId={profile.id}
            initial={{
              id: company.id, name: company.name, category: company.industry,
              contact_name: company.contact_name, contact_title: company.contact_title,
              email: company.email, phone: company.phone, owner_id: company.owner_id,
              stage: company.stage, confirmed: company.confirmed,
              payment_status: company.payment_status,
              amount_due: Number(company.amount_due), amount_paid: Number(company.amount_paid),
              last_contact: company.last_contact, next_action: company.next_action,
              next_action_date: company.next_action_date,
              source: company.source, notes: company.notes,
            }}
          />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Activity</h2>
          <ActivityFeed entries={activity ?? []} profiles={profiles ?? []} />
        </div>
      </div>
    </div>
  );
}
