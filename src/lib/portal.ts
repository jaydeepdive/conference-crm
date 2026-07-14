/**
 * Attendee-portal auth/context helpers.
 *
 * The staff app uses `requireConferenceAccess()`; the portal has a parallel
 * `getPortalContext(slug)` that resolves the current user's attendee_profile,
 * the underlying lead entity (company or investor), and the conference. It
 * redirects to /portal/login (no session) or /portal (no attendee_profile in
 * this conference) as appropriate.
 */
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { AttendeeProfile, AttendeeSide, Company, Conference, Investor } from "./types";

export interface PortalUser {
  id: string;
  email: string | null;
}

export interface PortalContext {
  user: PortalUser;
  attendee: AttendeeProfile;
  conference: Conference;
  side: AttendeeSide;
  /** The lead entity the attendee represents — Company for side='company', Investor for side='investor'. */
  lead: Company | Investor;
}

/** Return the attendee_profiles the current user has, across all conferences. Empty if none. */
export async function getAttendeeProfilesForCurrentUser(): Promise<AttendeeProfile[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("attendee_profiles").select("*").eq("user_id", user.id);
  return (data ?? []) as AttendeeProfile[];
}

/**
 * Resolve the portal context for a given conference slug. Redirects on failure.
 * Guarantees a returned object where every field is non-null.
 */
export async function getPortalContext(slug: string): Promise<PortalContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/portal/login?next=${encodeURIComponent(`/portal/${slug}`)}`);
  }
  const authUser = user!;

  const { data: conference } = await supabase
    .from("conferences").select("*").eq("slug", slug).single();
  if (!conference) redirect("/portal");
  const conf = conference as Conference;

  const { data: attendeeRow } = await supabase
    .from("attendee_profiles").select("*")
    .eq("user_id", authUser.id).eq("conference_id", conf.id).maybeSingle();
  if (!attendeeRow) redirect("/portal");
  const attendee = attendeeRow as AttendeeProfile;

  const table = attendee.lead_type === "company" ? "companies" : "investors";
  const { data: leadRow } = await supabase.from(table).select("*").eq("id", attendee.lead_id).single();
  if (!leadRow) redirect("/portal");

  return {
    user: { id: authUser.id, email: authUser.email ?? null },
    attendee,
    conference: conf,
    side: attendee.lead_type,
    lead: leadRow as Company | Investor,
  };
}

/** Extract the display name for a lead — Company.name or Investor.firm_name. */
export function leadDisplayName(lead: Company | Investor, side: AttendeeSide): string {
  return side === "company" ? (lead as Company).name : (lead as Investor).firm_name;
}

/** Generate a URL-safe invite token — 32 hex chars via WebCrypto. */
export function generateInviteToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}
