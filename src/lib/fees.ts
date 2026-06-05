import type { ConferenceEntity } from "./types";

export interface LeadCounts {
  signedUpCompanies: number;
  signedUpInvestors: number;
  registeredCompanies: number;
  registeredInvestors: number;
  paidCompanies: number;
  paidInvestors: number;
}

/** Calculate the management fee owed to one entity based on its terms + actual lead counts. */
export function calculateFee(ce: ConferenceEntity, counts: LeadCounts): number {
  if (ce.fee_type === "split_only") return 0;

  const get = (which: "company" | "investor" | "any") => {
    if (which === "company") {
      if (ce.fee_basis === "paid") return counts.paidCompanies;
      if (ce.fee_basis === "registered") return counts.registeredCompanies;
      return counts.signedUpCompanies;
    }
    if (which === "investor") {
      if (ce.fee_basis === "paid") return counts.paidInvestors;
      if (ce.fee_basis === "registered") return counts.registeredInvestors;
      return counts.signedUpInvestors;
    }
    if (ce.fee_basis === "paid") return counts.paidCompanies + counts.paidInvestors;
    if (ce.fee_basis === "registered") return counts.registeredCompanies + counts.registeredInvestors;
    return counts.signedUpCompanies + counts.signedUpInvestors;
  };

  let raw = 0;
  if (ce.fee_type === "per_company") raw = ce.fee_amount * get("company");
  else if (ce.fee_type === "per_investor") raw = ce.fee_amount * get("investor");
  else if (ce.fee_type === "per_lead") raw = ce.fee_amount * get("any");
  else if (ce.fee_type === "flat") raw = ce.fee_amount;

  if (ce.fee_min != null && raw < ce.fee_min) raw = ce.fee_min;
  if (ce.fee_max != null && raw > ce.fee_max) raw = ce.fee_max;

  return raw;
}

export function feeTermsLabel(ce: ConferenceEntity): string {
  if (ce.fee_type === "split_only") return "No fee";
  const basis = ce.fee_basis === "paid" ? "paid" : ce.fee_basis === "registered" ? "registered" : "signed-up";
  if (ce.fee_type === "flat") return `Flat $${ce.fee_amount.toLocaleString()}`;
  const unit = ce.fee_type === "per_company" ? "company" : ce.fee_type === "per_investor" ? "investor" : "lead";
  let s = `$${ce.fee_amount.toLocaleString()} per ${basis} ${unit}`;
  if (ce.fee_min != null) s += ` · min $${ce.fee_min.toLocaleString()}`;
  if (ce.fee_max != null) s += ` · max $${ce.fee_max.toLocaleString()}`;
  return s;
}
