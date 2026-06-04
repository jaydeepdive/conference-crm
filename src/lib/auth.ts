import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

export async function getCurrentProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single();

  if (!profile) redirect("/login");
  return profile as Profile;
}

export async function requireTeam(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin" && profile.role !== "team") {
    redirect("/pending");
  }
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
