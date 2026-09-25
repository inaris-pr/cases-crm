/**
 * Case lifecycle (Phase 7): status history, closing, reopening, resolution
 * time, and escalations.
 *
 * Every write here takes the acting employee from the server session (the
 * caller passes the authenticated User) — never a name from a request body.
 * History is append-only: nothing recorded is rewritten, and nothing before
 * Phase 7 is fabricated.
 */
import {
  store,
  nextCaseEscalationId,
  nextCaseStatusEventId,
  type Case,
  type CaseEscalation,
  type CaseStatus,
  type CaseStatusEvent,
  type User,
} from "./store.js";
import { isTerminalStatus, type EscalationReason } from "./caseMeta.js";

/**
 * Move `c` to `toStatus`, recording the change. Returns the event, or null
 * when the status does not change (a no-op update records nothing).
 *
 *   non-terminal → terminal   "closed":   closedAt = now, closedBy = actor
 *   terminal → non-terminal   "reopened": closedAt/closedBy cleared (the
 *                              earlier closure stays in the history)
 *   anything else             "status_change"
 */
export function changeCaseStatus(c: Case, toStatus: CaseStatus, actor: User, now: string): CaseStatusEvent | null {
  const fromStatus = c.status;
  if (fromStatus === toStatus) return null;
  const wasClosed = isTerminalStatus(fromStatus);
  const willBeClosed = isTerminalStatus(toStatus);
  const kind: CaseStatusEvent["kind"] =
    !wasClosed && willBeClosed ? "closed" : wasClosed && !willBeClosed ? "reopened" : "status_change";
  c.status = toStatus;
  if (kind === "closed") {
    c.closedAt = now;
    c.closedByUserId = actor.id;
    c.closedByName = actor.name;
  } else if (kind === "reopened") {
    c.closedAt = null;
    c.closedByUserId = null;
    c.closedByName = null;
  }
  const event: CaseStatusEvent = {
    id: nextCaseStatusEventId(),
    caseId: c.id,
    kind,
    fromStatus,
    toStatus,
    changedAt: now,
    changedByUserId: actor.id,
    changedByName: actor.name,
  };
  store.caseStatusEvents.push(event);
  return event;
}

/**
 * A Case created directly in a terminal status was closed by its creator at
 * creation: record that closure (fromStatus null) so closedAt is real.
 */
export function recordClosedAtCreation(c: Case, actor: User): CaseStatusEvent | null {
  if (!isTerminalStatus(c.status)) return null;
  c.closedAt = c.createdAt;
  c.closedByUserId = actor.id;
  c.closedByName = actor.name;
  const event: CaseStatusEvent = {
    id: nextCaseStatusEventId(),
    caseId: c.id,
    kind: "closed",
    fromStatus: null,
    toStatus: c.status,
    changedAt: c.createdAt,
    changedByUserId: actor.id,
    changedByName: actor.name,
  };
  store.caseStatusEvents.push(event);
  return event;
}

/** The Case's recorded status changes, oldest first. */
export function statusHistory(caseId: number): CaseStatusEvent[] {
  return store.caseStatusEvents
    .filter((e) => e.caseId === caseId)
    .sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt) || a.id - b.id);
}

export interface Resolution {
  /** closedAt − createdAt, in ms: total elapsed from creation to the CURRENT closure. */
  totalMs: number;
  /**
   * For a Case that was reopened and closed again: last reopen → current
   * closure, in ms. Null when the Case was never reopened (then the latest
   * cycle IS the whole Case).
   */
  latestCycleMs: number | null;
  closedAt: string;
  /** How many closures are recorded (1 + times it closed again after a reopen). */
  closures: number;
}

/**
 * Simple resolution time — only for a Case that is closed now AND has a
 * known closedAt. Calendar time, not business hours; waiting periods are not
 * subtracted; there are no SLA targets. A Case closed before Phase 7
 * (closedAt null) has no resolution time.
 */
export function resolutionOf(c: Case): Resolution | null {
  if (!isTerminalStatus(c.status) || !c.closedAt) return null;
  const closed = Date.parse(c.closedAt);
  const created = Date.parse(c.createdAt);
  if (!Number.isFinite(closed) || !Number.isFinite(created)) return null;
  const history = statusHistory(c.id);
  const lastReopen = [...history].reverse().find((e) => e.kind === "reopened");
  const reopenedAt = lastReopen ? Date.parse(lastReopen.changedAt) : NaN;
  return {
    totalMs: Math.max(0, closed - created),
    latestCycleMs: Number.isFinite(reopenedAt) ? Math.max(0, closed - reopenedAt) : null,
    closedAt: c.closedAt,
    closures: history.filter((e) => e.kind === "closed").length,
  };
}

// ── Escalations ─────────────────────────────────────────────────────────────

export function escalationsOf(caseId: number): CaseEscalation[] {
  return store.caseEscalations
    .filter((e) => e.caseId === caseId)
    .sort((a, b) => Date.parse(a.escalatedAt) - Date.parse(b.escalatedAt) || a.id - b.id);
}

/** The Case's unresolved escalation, if any (there is at most one). */
export function activeEscalationOf(caseId: number): CaseEscalation | null {
  return store.caseEscalations.find((e) => e.caseId === caseId && e.resolvedAt === null) ?? null;
}

/** Case ids with an unresolved escalation. */
export function activelyEscalatedCaseIds(): Set<number> {
  return new Set(store.caseEscalations.filter((e) => e.resolvedAt === null).map((e) => e.caseId));
}

export function escalateCase(
  c: Case,
  reason: EscalationReason,
  note: string | null,
  actor: User,
  now: string,
): CaseEscalation | "already_escalated" {
  if (activeEscalationOf(c.id)) return "already_escalated";
  const row: CaseEscalation = {
    id: nextCaseEscalationId(),
    caseId: c.id,
    reason,
    note,
    escalatedAt: now,
    escalatedByUserId: actor.id,
    escalatedByName: actor.name,
    resolvedAt: null,
    resolvedByUserId: null,
    resolvedByName: null,
  };
  store.caseEscalations.push(row);
  return row;
}

export function resolveEscalation(e: CaseEscalation, actor: User, now: string): CaseEscalation | "already_resolved" {
  if (e.resolvedAt !== null) return "already_resolved";
  e.resolvedAt = now;
  e.resolvedByUserId = actor.id;
  e.resolvedByName = actor.name;
  return e;
}
