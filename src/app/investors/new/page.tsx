import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LeadEditor } from "@/components/LeadEditor";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewInvestorPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const { data: profiles } = await supabase.from("profiles").select("*");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/investors" className="text-sm text-gray-500 hover:text-gray-700">← Investors</Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">New investor</h1>
      </div>
      <LeadEditor kind="investor" profiles={profiles ?? []} currentUserId={profile.id}
        initial={{
          name: "", category: null, contact_name: null, contact_title: null,
          email: null, phone: null, owner_id: profile.id,
          stage: "not_contacted", confirmed: "no", payment_status: "not_invoiced",
          amount_due: 0, amount_paid: 0, last_contact: null,
          next_action: null, next_action_date: null, source: null, notes: null,
          check_size: null, sector_focus: null,
        }}
      />
    </div>
  );
}
