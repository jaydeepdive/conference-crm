export type Role = "admin" | "team" | "attendee" | "pending"; // legacy v1 column
export type ConferenceRole = "conference_admin" | "recruiter" | "finance" | "viewer";

export type Stage = "not_contacted" | "reaching_out" | "in_discussion" | "verbal_commit" | "registered" | "declined";
export type Confirmed = "no" | "tentative" | "yes";
export type PaymentStatus = "not_invoiced" | "invoiced" | "partial" | "paid" | "waived";
export type LeadType = "company" | "investor";
export type ConfStatus = "planning" | "active" | "past" | "archived";
export type ExpenseCategory =
  | "Venue" | "Food & Beverage" | "Audio/Visual" | "Marketing"
  | "Speaker Travel" | "Staff" | "Software" | "Insurance" | "Other";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  is_super_admin: boolean;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
}

export interface Conference {
  id: string;
  slug: string;
  name: string;
  date_start: string | null;
  date_end: string | null;
  status: ConfStatus;
  notes: string | null;
  created_at: string;
}

export interface ConferenceEntity {
  id: string;
  conference_id: string;
  entity_id: string;
  split_percentage: number;
}

export interface ConferenceMembership {
  id: string;
  profile_id: string;
  conference_id: string;
  role: ConferenceRole;
  created_at: string;
}

export interface LeadBase {
  id: string;
  conference_id: string;
  owner_id: string | null;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  phone: string | null;
  stage: Stage;
  confirmed: Confirmed;
  payment_status: PaymentStatus;
  amount_due: number;
  amount_paid: number;
  last_contact: string | null;
  next_action: string | null;
  next_action_date: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company extends LeadBase {
  name: string;
  industry: string | null;
}

export interface Investor extends LeadBase {
  firm_name: string;
  investor_type: string | null;
  check_size: string | null;
  sector_focus: string | null;
}

export interface ActivityEntry {
  id: string;
  conference_id: string;
  user_id: string | null;
  lead_type: LeadType;
  lead_id: string;
  lead_name: string;
  action: string;
  notes: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  conference_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
  vendor: string | null;
  receipt_url: string | null;
  receipt_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Helpers
export function canSeePayments(role: ConferenceRole | "super_admin"): boolean {
  return role === "super_admin" || role === "conference_admin" || role === "finance";
}
export function canEditLeads(role: ConferenceRole | "super_admin"): boolean {
  return role !== "viewer" && role !== "finance";
}
export function canEditExpenses(role: ConferenceRole | "super_admin"): boolean {
  return role === "super_admin" || role === "conference_admin" || role === "finance";
}
export function canManageTeam(role: ConferenceRole | "super_admin"): boolean {
  return role === "super_admin" || role === "conference_admin";
}
