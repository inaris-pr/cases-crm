/**
 * Case categories, escalation reasons, terminal statuses and resolution
 * formatting for the web app (Phase 7). Mirrors the API's
 * api-server/src/caseMeta.ts; test/case-meta.test.ts checks they agree.
 * Pure module — imports nothing — so the API test suite can import it.
 * lib/api.ts re-exports CaseCategory and EscalationReason from here.
 */
export type CaseCategory =
  | "general"
  | "formation_filing"
  | "compliance"
  | "registered_agent"
  | "ein_tax"
  | "billing_refund"
  | "customer_dispute"
  | "filing_correction"
  | "partner_issue"
  | "account_portal";

export type EscalationReason =
  | "refund_request"
  | "customer_dispute"
  | "incorrect_filing"
  | "partner_issue"
  | "deadline_risk"
  | "customer_impact"
  | "other";

/** Same union as CaseStatus in lib/api.ts (kept local so this module imports nothing). */
type CaseStatus = "intake" | "review" | "in_progress" | "waiting" | "completed";

export const CASE_CATEGORY_OPTIONS: readonly { key: CaseCategory; label: string }[] = [
  { key: "general", label: "General / Other" },
  { key: "formation_filing", label: "Formation / Filing" },
  { key: "compliance", label: "Compliance" },
  { key: "registered_agent", label: "Registered Agent" },
  { key: "ein_tax", label: "EIN / Tax" },
  { key: "billing_refund", label: "Billing / Refund Request" },
  { key: "customer_dispute", label: "Customer Dispute" },
  { key: "filing_correction", label: "Filing Correction / Incorrect Filing" },
  { key: "partner_issue", label: "Partner Issue" },
  { key: "account_portal", label: "Account / Portal" },
];

export const ESCALATION_REASON_OPTIONS: readonly { key: EscalationReason; label: string }[] = [
  { key: "refund_request", label: "Refund Request" },
  { key: "customer_dispute", label: "Customer Dispute" },
  { key: "incorrect_filing", label: "Incorrect Filing / Filing Correction" },
  { key: "partner_issue", label: "Partner Issue" },
  { key: "deadline_risk", label: "Deadline Risk" },
  { key: "customer_impact", label: "Customer Impact" },
  { key: "other", label: "Other" },
];

export const TERMINAL_CASE_STATUSES: readonly CaseStatus[] = ["completed"];

export function categoryLabel(key: CaseCategory | null | undefined): string {
  if (!key) return "Uncategorized";
  return CASE_CATEGORY_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export function escalationReasonLabel(key: EscalationReason): string {
  return ESCALATION_REASON_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

/** The status picker's names for the stored statuses (Case Detail). */
export const CASE_STATUS_PICKER_LABEL: Record<CaseStatus, string> = {
  intake: "Open",
  in_progress: "Working",
  review: "Pending Customer",
  waiting: "Waiting on 3rd Party",
  completed: "Closed",
};

/** A duration in ms as "3 d 4 h", "5 h 12 min", "8 min", "< 1 min". Calendar time. */
export function formatDuration(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "< 1 min";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}
