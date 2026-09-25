/**
 * Case categories, escalation reasons and the terminal-status rule
 * (Phase 7 — case lifecycle, categories & escalations).
 *
 * Category, priority and escalation are three different things:
 *   - category   — WHAT the Case is about (one primary category, optional;
 *                  free-form tags stay available for anything else)
 *   - priority   — how urgent the work is (unchanged: low…critical)
 *   - escalation — an explicit, recorded hand-raise with a reason, made by an
 *                  employee and later resolved; history is kept
 * None is derived from another, and nothing is classified automatically.
 *
 * The web app keeps a copy of these labels in cases/src/lib/caseMeta.ts;
 * test/case-meta.test.ts checks the two agree.
 */
import type { CaseStatus } from "./store.js";

export const CASE_CATEGORIES = [
  "general",
  "formation_filing",
  "compliance",
  "registered_agent",
  "ein_tax",
  "billing_refund",
  "customer_dispute",
  "filing_correction",
  "partner_issue",
  "account_portal",
] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const CASE_CATEGORY_LABELS: Record<CaseCategory, string> = {
  general: "General / Other",
  formation_filing: "Formation / Filing",
  compliance: "Compliance",
  registered_agent: "Registered Agent",
  ein_tax: "EIN / Tax",
  billing_refund: "Billing / Refund Request",
  // An operational / customer-service dispute or complaint — NOT a card
  // chargeback (chargebacks wait for real payment data).
  customer_dispute: "Customer Dispute",
  filing_correction: "Filing Correction / Incorrect Filing",
  partner_issue: "Partner Issue",
  account_portal: "Account / Portal",
};

export const ESCALATION_REASONS = [
  "refund_request",
  "customer_dispute",
  "incorrect_filing",
  "partner_issue",
  "deadline_risk",
  "customer_impact",
  "other",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = {
  refund_request: "Refund Request",
  customer_dispute: "Customer Dispute",
  incorrect_filing: "Incorrect Filing / Filing Correction",
  partner_issue: "Partner Issue",
  deadline_risk: "Deadline Risk",
  customer_impact: "Customer Impact",
  other: "Other",
};

/**
 * Statuses that end a Case. The existing vocabulary has exactly one:
 * `completed` (shown as "Closed" in the status picker). No terminal status is
 * added for this feature.
 */
export const TERMINAL_CASE_STATUSES: readonly CaseStatus[] = ["completed"];
export const isTerminalStatus = (s: CaseStatus): boolean => TERMINAL_CASE_STATUSES.includes(s);

export function isCaseCategory(v: unknown): v is CaseCategory {
  return typeof v === "string" && (CASE_CATEGORIES as readonly string[]).includes(v);
}
