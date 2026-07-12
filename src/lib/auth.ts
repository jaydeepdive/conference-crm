import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile, Conference, ConferenceRole } from "./types";

export async function getCurrentProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single();

  if (!profile) redirect("/login");
  return profile as Profile;
}

export async function requireSuperAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile.is_super_admin) redirect("/conferences");
  return profile;
}

export interface ConferenceContext {
  profile: Profile;
  conference: Conference;
  effectiveRole: ConferenceRole | "super_admin";
}

/** Loads a conference by slug and confirms access.
 *  - Public conference + no membership → conference_admin (full access)
 *  - Public conference + membership.role=hidden → redirect (no access)
 *  - Private conference + no membership → redirect (must be explicitly invited)
 *  - Any + membership with a normal role → that role */
export async function requireConferenceAccess(slug: string): Promise<ConferenceContext> {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: conference } = await supabase
    .from("conferences").select("*").eq("slug", slug).single();
  if (!conference) redirect("/conferences");

  const conf = conference as Conference;

  if (profile.is_super_admin) {
    return { profile, conference: conf, effectiveRole: "super_admin" };
  }

  const { data: membership } = await supabase
    .from("conference_memberships")
    .select("role")
    .eq("profile_id", profile.id)
    .eq("conference_id", conf.id)
    .maybeSingle();

  const membershipRole = (membership as { role: ConferenceRole } | null)?.role;

  if (membershipRole === "hidden") redirect("/conferences");

  // Private conferences require an explicit membership
  if (!membershipRole && (conf.visibility ?? "public") === "private") {
    redirect("/conferences");
  }

  const effectiveRole: ConferenceRole = membershipRole ?? "conference_admin";
  return { profile, conference: conf, effectiveRole };
}

export async function requireConferenceRole(
  slug: string, allowed: (ConferenceRole | "super_admin")[],
): Promise<ConferenceContext> {
  const ctx = await requireConferenceAccess(slug);
  if (!allowed.includes(ctx.effectiveRole)) redirect(`/conferences/${slug}`);
  return ctx;
}
