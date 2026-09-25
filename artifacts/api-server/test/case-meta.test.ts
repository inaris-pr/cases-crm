import { describe, it, expect } from "vitest";
import {
  CASE_CATEGORIES,
  CASE_CATEGORY_LABELS,
  ESCALATION_REASONS,
  ESCALATION_REASON_LABELS,
  TERMINAL_CASE_STATUSES,
} from "../src/caseMeta";
import {
  CASE_CATEGORY_OPTIONS,
  ESCALATION_REASON_OPTIONS,
  TERMINAL_CASE_STATUSES as WEB_TERMINAL,
  categoryLabel,
  formatDuration,
} from "../../cases/src/lib/caseMeta";

/** Phase 7: the taxonomy is defined once per side; both sides must agree exactly. */
describe("case taxonomy (API vs web app)", () => {
  it("the ten approved categories, keys and labels, in order", () => {
    expect([...CASE_CATEGORIES]).toEqual([
      "general", "formation_filing", "compliance", "registered_agent", "ein_tax",
      "billing_refund", "customer_dispute", "filing_correction", "partner_issue", "account_portal",
    ]);
    expect(CASE_CATEGORY_OPTIONS.map((o) => [o.key, o.label])).toEqual(
      CASE_CATEGORIES.map((k) => [k, CASE_CATEGORY_LABELS[k]]),
    );
    expect(CASE_CATEGORY_LABELS.customer_dispute).toBe("Customer Dispute");
  });

  it("the seven approved escalation reasons — no chargeback", () => {
    expect([...ESCALATION_REASONS]).toEqual([
      "refund_request", "customer_dispute", "incorrect_filing", "partner_issue", "deadline_risk", "customer_impact", "other",
    ]);
    expect(ESCALATION_REASON_OPTIONS.map((o) => [o.key, o.label])).toEqual(
      ESCALATION_REASONS.map((k) => [k, ESCALATION_REASON_LABELS[k]]),
    );
    expect(ESCALATION_REASONS.some((r) => /charge/i.test(r))).toBe(false);
  });

  it("exactly one terminal status, the existing `completed`", () => {
    expect([...TERMINAL_CASE_STATUSES]).toEqual(["completed"]);
    expect([...WEB_TERMINAL]).toEqual(["completed"]);
  });

  it("labels and durations", () => {
    expect(categoryLabel(null)).toBe("Uncategorized");
    expect(categoryLabel("ein_tax")).toBe("EIN / Tax");
    expect(formatDuration(30_000)).toBe("< 1 min");
    expect(formatDuration(8 * 60_000)).toBe("8 min");
    expect(formatDuration((5 * 60 + 12) * 60_000)).toBe("5 h 12 min");
    expect(formatDuration((3 * 24 + 4) * 3_600_000)).toBe("3 d 4 h");
    expect(formatDuration(2 * 86_400_000)).toBe("2 d");
  });
});
