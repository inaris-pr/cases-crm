/**
 * The Case Thread as a unified operational timeline (Phase 7 follow-up).
 *
 * The feed is assembled on the server, at read time, from the records that
 * are authoritative for each kind of activity — nothing is copied into a
 * second store that could drift:
 *
 *   comment                   store.threadEntries (human comments, unchanged)
 *   status_change             store.caseStatusEvents (Phase 7 lifecycle)
 *   escalation_created/_resolved  store.caseEscalations (Phase 7)
 *   task_created              store.tasks (createdAt, createdBy*, createdTitle
 *                               — the creation snapshot, not the editable title)
 *   document_uploaded         store.documents (createdAt, uploadedBy*)
 *   calls_outgoing_summary /  store.caseInteractions, channel "phone",
 *   calls_incoming_summary      one aggregated entry per direction
 *   contact_logged            store.caseInteractions, other channels
 *   category/priority/owner/account/primary_contact change,
 *   task_completed/_reopened  store.caseActivities — changes that have no
 *                             record of their own, recorded append-only at
 *                             the moment they happen (recordCaseActivity)
 *
 * Reserved, never produced today: `document_removed` (no removal exists)
 * and `automation_execution` (no automation engine exists; the Run button
 * only animates the graph).
 *
 * System entries never carry @-mentions and are never editable. The actor is
 * always the session's employee at the time; names are historical labels.
 */
import {
  store,
  nextCaseActivityId,
  type CaseActivity,
  type CaseStatus,
  type CasePriority,
  type TaskStatus,
  type User,
} from "./store.js";
import type { CaseCategory, EscalationReason } from "./caseMeta.js";

type Store = typeof store;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Append one immutable activity row for `caseId`, authored by `actor`. */
export function recordCaseActivity(
  caseId: number,
  actor: User,
  at: string,
  change: DistributiveOmit<CaseActivity, "id" | "caseId" | "at" | "actorUserId" | "actorName">,
): CaseActivity {
  const row = { id: nextCaseActivityId(), caseId, at, actorUserId: actor.id, actorName: actor.name, ...change } as CaseActivity;
  store.caseActivities.push(row);
  return row;
}

// ── Feed entries (duplicated in cases/src/lib/api.ts) ───────────────────────

export interface FeedActor {
  userId: number | null;
  name: string;
}

export interface CallSummary {
  id: number;
  at: string;
  by: FeedActor;
  contact: string;
  summary: string;
}

type Entry<T extends string, D> = { key: string; type: T; at: string; actor: FeedActor | null } & D;

export type FeedEntry =
  | Entry<"comment", { comment: { id: number; authorName: string; authorUserId: number | null; body: string; createdAt: string } }>
  | Entry<"status_change", { kind: "status_change" | "closed" | "reopened"; fromStatus: CaseStatus | null; toStatus: CaseStatus }>
  | Entry<"category_change", { from: CaseCategory | null; to: CaseCategory | null }>
  | Entry<"priority_change", { from: CasePriority; to: CasePriority }>
  | Entry<"owner_change", { fromUserId: number | null; fromName: string; toUserId: number; toName: string }>
  | Entry<"account_change", { fromAccountId: number; fromName: string; toAccountId: number; toName: string }>
  | Entry<"primary_contact_change", { fromContactId: number | null; fromName: string | null; toContactId: number | null; toName: string | null }>
  | Entry<"escalation_created", { escalationId: number; reason: EscalationReason; note: string | null }>
  | Entry<"escalation_resolved", { escalationId: number; reason: EscalationReason }>
  | Entry<"task_created", {
      taskId: number;
      /** The title when the task was created — never the current title. */
      title: string;
      /** "creation": captured at creation; "first_recorded": an older task, the title as first recorded. */
      titleSource: "creation" | "first_recorded";
    }>
  | Entry<"task_completed", { taskId: number; title: string }>
  | Entry<"task_reopened", { taskId: number; title: string; toStatus: TaskStatus }>
  | Entry<"document_uploaded", { documentId: number; filename: string; href: string | null }>
  | Entry<"document_removed", { documentId: number; filename: string }>
  | Entry<"calls_outgoing_summary" | "calls_incoming_summary", { count: number; latest: CallSummary; previous: { id: number; at: string; by: FeedActor }[] }>
  | Entry<"contact_logged", { interactionId: number; direction: "inbound" | "outbound"; channel: string; contact: string; summary: string }>
  | Entry<"automation_execution", { automationId: number; automationName: string; outcome: "succeeded" | "failed" }>;

export type FeedEntryType = FeedEntry["type"];

/**
 * A document's link, only when it is an ordinary http(s) URL — the same
 * target the Documents tab opens. Anything else (javascript:, data:, relative
 * paths…) gets no link.
 */
export function safeDocumentHref(fileUrl: string): string | null {
  try {
    const u = new URL(fileUrl);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Previous calls listed on an aggregated call card (besides the latest). */
export const CALL_CARD_PREVIOUS = 3;

/** Same-instant entries keep a stable, meaningful order. */
const TYPE_RANK: Record<FeedEntryType, number> = {
  status_change: 0,
  category_change: 1,
  priority_change: 2,
  owner_change: 3,
  account_change: 4,
  primary_contact_change: 5,
  escalation_created: 6,
  escalation_resolved: 7,
  task_created: 8,
  task_completed: 9,
  task_reopened: 10,
  document_uploaded: 11,
  document_removed: 12,
  contact_logged: 13,
  calls_outgoing_summary: 14,
  calls_incoming_summary: 15,
  automation_execution: 16,
  comment: 17,
};

const actor = (userId: number | null, name: string | null): FeedActor | null =>
  name ? { userId, name } : null;

/**
 * The Case's Thread feed, oldest first (the Thread's existing order). The
 * caller must already have checked that the viewer may see this Case.
 */
export function buildCaseFeed(caseId: number, s: Store = store): FeedEntry[] {
  const out: FeedEntry[] = [];

  for (const t of s.threadEntries.filter((x) => x.caseId === caseId)) {
    out.push({
      key: `comment:${t.id}`,
      type: "comment",
      at: t.createdAt,
      actor: actor(t.authorUserId, t.authorName),
      comment: { id: t.id, authorName: t.authorName, authorUserId: t.authorUserId, body: t.body, createdAt: t.createdAt },
    });
  }

  for (const e of s.caseStatusEvents.filter((x) => x.caseId === caseId)) {
    out.push({
      key: `status:${e.id}`,
      type: "status_change",
      at: e.changedAt,
      actor: actor(e.changedByUserId, e.changedByName),
      kind: e.kind,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
    });
  }

  for (const a of s.caseActivities.filter((x) => x.caseId === caseId)) {
    const { id, caseId: _c, at, actorUserId, actorName, ...change } = a;
    out.push({ key: `activity:${id}`, at, actor: actor(actorUserId, actorName), ...change } as FeedEntry);
  }

  for (const e of s.caseEscalations.filter((x) => x.caseId === caseId)) {
    out.push({
      key: `escalation:${e.id}:created`,
      type: "escalation_created",
      at: e.escalatedAt,
      actor: actor(e.escalatedByUserId, e.escalatedByName),
      escalationId: e.id,
      reason: e.reason,
      note: e.note,
    });
    if (e.resolvedAt) {
      out.push({
        key: `escalation:${e.id}:resolved`,
        type: "escalation_resolved",
        at: e.resolvedAt,
        actor: actor(e.resolvedByUserId, e.resolvedByName),
        escalationId: e.id,
        reason: e.reason,
      });
    }
  }

  for (const t of s.tasks.filter((x) => x.caseId === caseId)) {
    out.push({
      key: `task:${t.id}:created`,
      type: "task_created",
      at: t.createdAt,
      actor: actor(t.createdByUserId ?? null, t.createdByName ?? null),
      taskId: t.id,
      // Immutable: the creation snapshot, not the current (editable) title.
      title: t.createdTitle,
      titleSource: t.createdByName !== null ? "creation" : "first_recorded",
    });
  }

  for (const d of s.documents.filter((x) => x.caseId === caseId)) {
    out.push({
      key: `document:${d.id}:uploaded`,
      type: "document_uploaded",
      at: d.createdAt,
      actor: actor(d.uploadedByUserId ?? null, d.uploadedByName ?? null),
      documentId: d.id,
      filename: d.filename,
      href: safeDocumentHref(d.fileUrl),
    });
  }

  // Interactions: phone calls aggregate into ONE entry per direction, placed
  // at the latest call; other channels (email, SMS, meeting, other) are
  // individual compact entries. Always recomputed from the call log.
  const interactions = s.caseInteractions
    .filter((x) => x.caseId === caseId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id);
  for (const direction of ["outbound", "inbound"] as const) {
    const calls = interactions.filter((x) => x.channel === "phone" && x.direction === direction);
    if (calls.length === 0) continue;
    const [latest, ...rest] = calls;
    out.push({
      key: `calls:${direction}`,
      type: direction === "outbound" ? "calls_outgoing_summary" : "calls_incoming_summary",
      at: latest.createdAt,
      actor: null,
      count: calls.length,
      latest: {
        id: latest.id,
        at: latest.createdAt,
        by: { userId: latest.byUserId, name: latest.byName },
        contact: latest.contact,
        summary: latest.summary,
      },
      previous: rest.slice(0, CALL_CARD_PREVIOUS).map((c) => ({ id: c.id, at: c.createdAt, by: { userId: c.byUserId, name: c.byName } })),
    });
  }
  for (const x of interactions.filter((i) => i.channel !== "phone")) {
    out.push({
      key: `contact:${x.id}`,
      type: "contact_logged",
      at: x.createdAt,
      actor: actor(x.byUserId, x.byName),
      interactionId: x.id,
      direction: x.direction,
      channel: x.channel,
      contact: x.contact,
      summary: x.summary,
    });
  }

  // Chronological. Recorded changes that share a millisecond keep the order
  // they happened in (their ids); otherwise same-instant entries fall back to
  // a fixed type order, then the key — the result is always the same.
  const activityId = (e: FeedEntry) => (e.key.startsWith("activity:") ? Number(e.key.slice(9)) : null);
  return out.sort((a, b) => {
    const byTime = Date.parse(a.at) - Date.parse(b.at);
    if (byTime) return byTime;
    const ia = activityId(a);
    const ib = activityId(b);
    if (ia !== null && ib !== null) return ia - ib;
    return TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.key.localeCompare(b.key, "en", { numeric: true });
  });
}
