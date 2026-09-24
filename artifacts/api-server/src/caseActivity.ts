/**
 * Derived "last activity" for Cases (RBAC Phase 6 dashboards).
 *
 * lastActivityAt = the latest timestamp among the Case's RECORDED activity:
 *   - the Case itself: createdAt, updatedAt (updatedAt moves on every edit
 *     through PATCH /cases/:id and on reassignment)
 *   - call/contact logs (CaseInteraction.createdAt)
 *   - comments (CaseThreadEntry.createdAt)
 *   - tasks created on the Case (Task.createdAt)
 *   - documents added to the Case (Doc.createdAt)
 *
 * Not included, because the data does not record a time: task status
 * changes and task edits (tasks have no updatedAt). Messages that merely
 * tag a Case are conversation, not Case work, and are not included.
 * Nothing here writes to the Case — Case.updatedAt is never touched.
 */
import type { Case, CaseInteraction, CaseThreadEntry, Doc, Task } from "./store.js";

export type ActivitySource = "created" | "updated" | "call_log" | "comment" | "task" | "document";

export interface LastActivity {
  at: string;
  source: ActivitySource;
}

export interface ActivityData {
  cases: readonly Case[];
  caseInteractions: readonly CaseInteraction[];
  threadEntries: readonly CaseThreadEntry[];
  tasks: readonly Task[];
  documents: readonly Doc[];
}

function valid(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : null;
}

/** Last recorded activity for every Case, by case id. */
export function lastActivityIndex(data: ActivityData): Map<number, LastActivity> {
  const best = new Map<number, { t: number; source: ActivitySource }>();
  const offer = (caseId: number, ts: string | null | undefined, source: ActivitySource) => {
    const t = valid(ts);
    if (t === null) return;
    const cur = best.get(caseId);
    if (!cur || t > cur.t) best.set(caseId, { t, source });
  };
  for (const c of data.cases) {
    offer(c.id, c.createdAt, "created");
    offer(c.id, c.updatedAt, "updated");
  }
  const known = new Set(data.cases.map((c) => c.id));
  for (const i of data.caseInteractions) if (known.has(i.caseId)) offer(i.caseId, i.createdAt, "call_log");
  for (const e of data.threadEntries) if (known.has(e.caseId)) offer(e.caseId, e.createdAt, "comment");
  for (const t of data.tasks) if (known.has(t.caseId)) offer(t.caseId, t.createdAt, "task");
  for (const d of data.documents) if (known.has(d.caseId)) offer(d.caseId, d.createdAt, "document");
  const out = new Map<number, LastActivity>();
  for (const [id, v] of best) out.set(id, { at: new Date(v.t).toISOString(), source: v.source });
  return out;
}
