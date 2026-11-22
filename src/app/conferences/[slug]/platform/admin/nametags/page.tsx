/**
 * Admin console → Name tags: make / reprint a single name tag at the event.
 * Brother QL-820NWBc, DK-2113 (62 mm continuous) — 100 × 62 mm per tag.
 */
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { splitInvestor } from "@/lib/printSchedule";
import { NameTagClient, type TagPreset } from "./NameTagClient";

export const dynamic = "force-dynamic";

const tidy = (s: string) => s.replace(/\s+/g, " ").trim().replace(/\b([a-z])([a-z]*)\b/g, (m, a, b) => (m === m.toLowerCase() && m.length > 2 ? a.toUpperCase() + b : m));

export default async function NameTagsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", slug).maybeSingle();
  if (!conf) { notFound(); throw new Error("unreachable"); }
  const [{ data: people }, { data: cos }, { data: invs }] = await Promise.all([
    svc.from("attendee_profiles").select("lead_type, lead_id, full_name").eq("conference_id", conf.id),
    svc.from("companies").select("id, name, stage").eq("conference_id", conf.id).eq("stage", "registered"),
    svc.from("investors").select("id, firm_name, contact_name, stage").eq("conference_id", conf.id).eq("stage", "registered"),
  ]);
  const co = new Map((cos ?? []).map(c => [c.id as string, c.name as string]));
  const inv = new Map((invs ?? []).map(i => [i.id as string, splitInvestor(i.firm_name as string | null, i.contact_name as string | null)]));
  const seen = new Set<string>();
  const presets: TagPreset[] = [];
  for (const p of people ?? []) {
    const name = tidy(((p.full_name as string | null) ?? "")); if (!name) continue;
    if (p.lead_type === "company") {
      const org = co.get(p.lead_id as string); if (!org) continue;
      const k = `c|${name}|${org}`; if (seen.has(k)) continue; seen.add(k);
      presets.push({ type: "company", name, org });
    } else {
      const i = inv.get(p.lead_id as string); if (!i) continue;
      const k = `i|${name}`; if (seen.has(k)) continue; seen.add(k);
      presets.push({ type: "investor", name, org: i.firm ?? "" });
    }
  }
  presets.sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">Print</div>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">Name tags</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Make a tag for anyone — pick a registered attendee or type it in. Prints one 100 × 62 mm tag on the Brother QL-820NWBc (DK-2113, 62 mm roll).
        </p>
      </div>
      <NameTagClient presets={presets} />
    </div>
  );
}
