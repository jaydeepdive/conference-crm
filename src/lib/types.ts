export type Role = "admin" | "team" | "attendee" | "pending"; // legacy v1 column
export type ConferenceRole = "conference_admin" | "recruiter" | "finance" | "viewer" | "hidden";

export type Stage = "pending_approval" | "not_contacted" | "reaching_out" | "in_discussion" | "verbal_commit" | "registered" | "declined";
export type Confirmed = "no" | "tentative" | "yes";
export type PaymentStatus = "not_invoiced" | "invoiced" | "partial" | "paid" | "waived";
export type LeadType = "company" | "investor";
export type ConfStatus = "planning" | "active" | "past" | "archived";
export type ExpenseCategory =
  | "Venue" | "Food & Beverage" | "Audio/Visual" | "Marketing"
  | "Speaker Travel" | "Staff" | "Software" | "Insurance" | "Other";
export type EmailKind = "invoice" | "reminder" | "welcome" | "marketing" | "registration" | "general" | "other";
export type InvoiceStatus = "draft" | "sent" | "viewed" | "paid" | "overdue" | "void";

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

export type DiscountType = "percent" | "fixed";
export type ConfVisibility = "public" | "private";

export interface Conference {
  id: string;
  slug: string;
  name: string;
  date_start: string | null;
  date_end: string | null;
  status: ConfStatus;
  visibility: ConfVisibility;
  notes: string | null;
  created_at: string;
  client_discount_type: DiscountType;
  client_discount_value: number;
  client_discount_label: string;
  invoice_issuer_name: string | null;
  invoice_issuer_address: string | null;
  invoice_payment_instructions: string | null;
  // Attendee-portal meeting-scheduling knobs (added in 0012).
  timezone: string;
  meeting_start_time: string;         // "09:00:00"
  meeting_end_time: string;           // "16:00:00"
  meeting_lunch_start: string | null;
  meeting_lunch_end: string | null;
  meeting_slot_minutes: number;
  meeting_slot_stride_minutes: number;
  // SignWell participation-agreement config (added in 0014, extended in 0015).
  // Legacy single-template columns — kept for backwards compat, superseded
  // by `signwell_templates`.
  signwell_template_id: string | null;
  signwell_field_map: Record<string, string>;
  signwell_placeholder_signer: string;
  // Multi-template config (0015). Empty array = no templates configured.
  signwell_templates: SignWellTemplateConfig[];
}

export interface SignWellTemplateConfig {
  id: string;                                 // SignWell template UUID
  name: string;                               // operator-facing label
  placeholder_signer: string;                 // e.g. "Client"
  field_map: Record<string, string>;          // semantic slot → api_id
}

export type AgreementStatus =
  | "not_sent" | "sent" | "viewed" | "signed" | "declined" | "voided" | "expired";

export type FeeType = "split_only" | "per_company" | "per_investor" | "per_lead" | "flat";
export type FeeBasis = "signed_up" | "registered" | "paid";

export interface ConferenceEntity {
  id: string;
  conference_id: string;
  entity_id: string;
  split_percentage: number;
  fee_label: string | null;
  fee_type: FeeType;
  fee_amount: number;
  fee_basis: FeeBasis;
  fee_min: number | null;
  fee_max: number | null;
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
  ticker: string | null;
  website: string | null;
  is_tdd_client: boolean;
  tdd_match_type: string | null;
  tdd_company_data: { id: number; name: string; ticker: string; exchange: string; website: string; status: string; slug: string } | null;
  tdd_last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company extends LeadBase {
  name: string; industry: string | null;
  about: string | null;
  // SignWell agreement tracking (added in 0014).
  agreement_status: AgreementStatus;
  agreement_document_id: string | null;
  agreement_sent_at: string | null;
  agreement_viewed_at: string | null;
  agreement_completed_at: string | null;
  agreement_declined_at: string | null;
  agreement_signer_name: string | null;
  agreement_signer_email: string | null;
  agreement_pdf_url: string | null;
  // Which template variant was used for this company's agreement (0015).
  agreement_template_id: string | null;
  agreement_template_name: string | null;
}
export interface Investor extends LeadBase {
  firm_name: string; investor_type: string | null;
  check_size: string | null; sector_focus: string | null;
  about: string | null;
  investment_criteria: string | null;
}

// =====================================================================
// Attendee portal (added in 0012)
// =====================================================================

export type AttendeeSide = "company" | "investor";
export type MeetingStatus = "proposed" | "countered" | "accepted" | "declined" | "cancelled";
export type MeetingEventKind = "propose" | "counter" | "accept" | "decline" | "cancel" | "note";

export interface AttendeeProfile {
  id: string;
  conference_id: string;
  lead_type: AttendeeSide;
  lead_id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  title: string | null;
  phone: string | null;
  about: string | null;
  invite_token: string | null;
  invite_sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  conference_id: string;
  company_id: string;
  investor_id: string;
  status: MeetingStatus;
  proposed_time: string | null;
  proposed_by: AttendeeSide | null;
  scheduled_time: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingEvent {
  id: string;
  meeting_id: string;
  actor_profile_id: string | null;
  actor_side: AttendeeSide | "admin" | null;
  kind: MeetingEventKind;
  proposed_time: string | null;
  body: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: string; conference_id: string;
  user_id: string | null;
  lead_type: LeadType; lead_id: string; lead_name: string;
  action: string; notes: string | null; created_at: string;
}

export interface Expense {
  id: string; conference_id: string;
  category: ExpenseCategory; description: string;
  amount: number; date: string; vendor: string | null;
  receipt_url: string | null; receipt_path: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface LeadNote {
  id: string; conference_id: string;
  lead_type: LeadType; lead_id: string;
  user_id: string | null; body: string;
  created_at: string; updated_at: string;
}

export interface CompType {
  id: string; conference_id: string; name: string;
  default_cost: number; expense_category: ExpenseCategory; created_at: string;
}

export interface LeadComp {
  id: string; conference_id: string;
  lead_type: LeadType; lead_id: string;
  comp_type_id: string | null; name: string;
  cost: number; expense_category: ExpenseCategory;
  notes: string | null; created_by: string | null; created_at: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Invoice {
  id: string;
  conference_id: string;
  lead_type: LeadType;
  lead_id: string;
  invoice_number: number;
  line_items: InvoiceLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string | null;
  issued_date: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  notes: string | null;
  payment_terms: string | null;
  sent_at: string | null;
  sent_by: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  discount_label: string | null;
  discount_amount: number;
}

export interface EmailTemplate {
  id: string;
  conference_id: string;
  name: string;
  kind: EmailKind;
  subject: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SentEmail {
  id: string;
  conference_id: string;
  sender_user_id: string | null;
  kind: EmailKind;
  recipients: { email: string; name?: string; lead_type?: LeadType; lead_id?: string }[];
  cc: { email: string; name?: string }[];
  bcc: { email: string; name?: string }[];
  subject: string;
  body_snapshot: string;
  invoice_id: string | null;
  template_id: string | null;
  has_pdf_attachment: boolean;
  gmail_message_id: string | null;
  sent_at: string;
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
  return role === "super_admin";
}
export function canSendInvoices(role: ConferenceRole | "super_admin"): boolean {
  return role === "super_admin" || role === "conference_admin" || role === "finance";
}
export function canSendGeneralEmail(role: ConferenceRole | "super_admin"): boolean {
  return role !== "viewer"; // anyone with conference access except viewer
}
