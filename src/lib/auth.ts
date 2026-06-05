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

/** Loads a conference by slug and confirms the user can access it. Redirects if not. */
export async function requireConferenceAccess(slug: string): Promise<ConferenceContext> {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: conference } = await supabase
    .from("conferences").select("*").eq("slug", slug).single();
  if (!conference) redirect("/conferences");

  if (profile.is_super_admin) {
    return { profile, conference: conference as Conference, effectiveRole: "super_admin" };
  }

  const { data: membership } = await supabase
    .from("conference_memberships")
    .select("role")
    .eq("profile_id", profile.id)
    .eq("conference_id", (conference as Conference).id)
    .maybeSingle();

  if (!membership) redirect("/conferences");
  return { profile, conference: conference as Conference, effectiveRole: (membership as { role: ConferenceRole }).role };
}

export async function requireConferenceRole(
  slug: string, allowed: (ConferenceRole | "super_admin")[],
): Promise<ConferenceContext> {
  const ctx = await requireConferenceAccess(slug);
  if (!allowed.includes(ctx.effectiveRole)) redirect(`/conferences/${slug}`);
  return ctx;
}
