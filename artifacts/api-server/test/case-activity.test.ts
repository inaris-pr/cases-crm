import { describe, it, expect } from "vitest";
import { lastActivityIndex, type ActivityData } from "../src/caseActivity";
import type { Case } from "../src/store";

/**
 * lastActivityAt (RBAC Phase 6): the latest of the Case's createdAt and
 * updatedAt, its call/contact logs, comments, task creations and document
 * uploads. Derived only — the Case is never written.
 */
const T = (h: number) => new Date(Date.UTC(2026, 0, 1, h)).toISOString();

function makeCase(id: number, createdAt: string, updatedAt: string): Case {
  return { id, createdAt, updatedAt } as unknown as Case;
}
function data(over: Partial<ActivityData> = {}): ActivityData {
  return { cases: [], caseInteractions: [], threadEntries: [], tasks: [], documents: [], ...over };
}

describe("lastActivityIndex", () => {
  it("is the Case's own creation time when nothing else happened", () => {
    const idx = lastActivityIndex(data({ cases: [makeCase(1, T(1), T(1))] }));
    expect(idx.get(1)).toEqual({ at: T(1), source: "created" });
  });

  it("uses updatedAt when the Case was edited later", () => {
    const idx = lastActivityIndex(data({ cases: [makeCase(1, T(1), T(3))] }));
    expect(idx.get(1)).toEqual({ at: T(3), source: "updated" });
  });

  it("picks the latest of call logs, comments, tasks and documents", () => {
    const cases = [makeCase(1, T(1), T(1)), makeCase(2, T(1), T(1)), makeCase(3, T(1), T(1)), makeCase(4, T(1), T(1))];
    const idx = lastActivityIndex(
      data({
        cases,
        caseInteractions: [{ caseId: 1, createdAt: T(5) }, { caseId: 2, createdAt: T(2) }] as never,
        threadEntries: [{ caseId: 2, createdAt: T(6) }] as never,
        tasks: [{ caseId: 3, createdAt: T(7) }] as never,
        documents: [{ caseId: 4, createdAt: T(8) }, { caseId: 3, createdAt: T(4) }] as never,
      }),
    );
    expect(idx.get(1)).toEqual({ at: T(5), source: "call_log" });
    expect(idx.get(2)).toEqual({ at: T(6), source: "comment" });
    expect(idx.get(3)).toEqual({ at: T(7), source: "task" });
    expect(idx.get(4)).toEqual({ at: T(8), source: "document" });
  });

  it("ignores activity older than an edit, and rows for unknown cases", () => {
    const idx = lastActivityIndex(
      data({
        cases: [makeCase(1, T(1), T(9))],
        threadEntries: [{ caseId: 1, createdAt: T(4) }, { caseId: 99, createdAt: T(20) }] as never,
      }),
    );
    expect(idx.get(1)).toEqual({ at: T(9), source: "updated" });
    expect(idx.has(99)).toBe(false);
  });

  it("skips unparseable timestamps instead of treating them as now or epoch", () => {
    const idx = lastActivityIndex(
      data({ cases: [makeCase(1, T(2), T(2))], tasks: [{ caseId: 1, createdAt: "not a date" }] as never }),
    );
    expect(idx.get(1)).toEqual({ at: T(2), source: "created" });
  });

  it("never writes to the Case", () => {
    const c = makeCase(1, T(1), T(1));
    const before = JSON.stringify(c);
    lastActivityIndex(data({ cases: [c], threadEntries: [{ caseId: 1, createdAt: T(5) }] as never }));
    expect(JSON.stringify(c)).toBe(before);
  });
});
