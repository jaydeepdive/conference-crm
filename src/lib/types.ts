export type Role = "admin" | "team" | "attendee" | "pending";

export type Stage =
  | "not_contacted"
  | "reaching_out"
  | "in_discussion"
  | "verbal_commit"
  | "registered"
  | "declined";

export type Confirmed = "no" | "tentative" | "yes";

export type PaymentStatus =
  | "not_invoiced"
  | "invoiced"
  | "partial"
  | "paid"
  | "waived";

export type LeadType = "company" | "investor";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface LeadBase {
  id: string;
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
  user_id: string | null;
  lead_type: LeadType;
  lead_id: string;
  lead_name: string;
  action: string;
  notes: string | null;
  created_at: string;
}
