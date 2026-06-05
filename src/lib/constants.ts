import type { Stage, Confirmed, PaymentStatus, ConferenceRole, ExpenseCategory } from "./types";

export const STAGES: { value: Stage; label: string; color: string }[] = [
  { value: "not_contacted", label: "Not Contacted", color: "bg-gray-200 text-gray-800" },
  { value: "reaching_out", label: "Reaching Out", color: "bg-amber-100 text-amber-800" },
  { value: "in_discussion", label: "In Discussion", color: "bg-sky-100 text-sky-800" },
  { value: "verbal_commit", label: "Verbal Commit", color: "bg-emerald-100 text-emerald-800" },
  { value: "registered", label: "Registered", color: "bg-emerald-600 text-white" },
  { value: "declined", label: "Declined", color: "bg-rose-100 text-rose-800" },
];

export const CONFIRMED: { value: Confirmed; label: string; color: string }[] = [
  { value: "no", label: "No", color: "bg-rose-100 text-rose-800" },
  { value: "tentative", label: "Tentative", color: "bg-amber-100 text-amber-800" },
  { value: "yes", label: "Yes", color: "bg-emerald-100 text-emerald-800" },
];

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string; color: string }[] = [
  { value: "not_invoiced", label: "Not Invoiced", color: "bg-gray-100 text-gray-700" },
  { value: "invoiced", label: "Invoiced", color: "bg-amber-100 text-amber-800" },
  { value: "partial", label: "Partial", color: "bg-sky-100 text-sky-800" },
  { value: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-800" },
  { value: "waived", label: "Waived", color: "bg-emerald-50 text-emerald-700" },
];

export const INDUSTRIES = ["SaaS / Software","Fintech","Healthtech","Cleantech / Energy","Consumer","Hardware","AI / ML","Biotech","Marketplace","Mining","Energy","Other"];
export const INVESTOR_TYPES = ["Venture Capital","Angel","Private Equity","Family Office","Corporate VC","Strategic","Accelerator","Other"];
export const ACTIVITY_ACTIONS = ["Claimed","Email Sent","Call","Meeting","Follow-up","Invoice Sent","Payment Received","Registered","Declined","Other"];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Venue","Food & Beverage","Audio/Visual","Marketing","Speaker Travel","Staff","Software","Insurance","Other",
];

export const CONFERENCE_ROLES: { value: ConferenceRole; label: string; description: string }[] = [
  { value: "conference_admin", label: "Conference Admin", description: "Full access to this conference, including team and budget" },
  { value: "finance", label: "Finance", description: "Budget + payment data; read-only on leads" },
  { value: "recruiter", label: "Recruiter", description: "Leads + activity; payments + budget hidden" },
  { value: "viewer", label: "Viewer", description: "Read-only access to leads" },
];

export function stageMeta(s: Stage) { return STAGES.find(x => x.value === s)!; }
export function confirmedMeta(c: Confirmed) { return CONFIRMED.find(x => x.value === c)!; }
export function paymentMeta(p: PaymentStatus) { return PAYMENT_STATUSES.find(x => x.value === p)!; }
