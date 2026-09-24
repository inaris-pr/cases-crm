import { describe, it, expect } from "vitest";
// Every /api route requires a session: requests carry Iris's session cookie.
import { authedRequest as request } from "./helpers/app";
import { createTestApp, asMe } from "./helpers/app";
import {
  DEFAULT_CASE_SORT,
  caseNumberValue,
  caseSortDirection,
  nextCaseSort,
  sortCases,
  type CaseSort,
  type SortableCase,
} from "../../cases/src/lib/caseSort";

/**
 * Cases table column sorting (Records → Cases → Table), lib/caseSort.ts.
 *
 * Case # and Created cycle ascending → descending → default, one column at a
 * time. The default is Last Modified (updatedAt, newest first), the order
 * GET /api/cases already returns. Sorting runs over the rows the server
 * returned after search and filters, and never changes a record.
 */

const app = createTestApp();

const nums = (rows: SortableCase[]) => rows.map((r) => r.caseNumber);
const ids = (rows: SortableCase[]) => rows.map((r) => r.id);

const T = (day: number, h = 0) => new Date(Date.UTC(2026, 0, day, h)).toISOString();

/**
 * Deliberately scrambled so no order is correct by accident. Case numbers
 * straddle digit boundaries (9/10, 99/100) to catch text sorting, and the
 * three orders (number, created, modified) all differ.
 */
function fixture(): SortableCase[] {
  return [
    { id: 1, caseNumber: "CASE-10", createdAt: T(5), updatedAt: T(20) },
    { id: 2, caseNumber: "CASE-9", createdAt: T(9), updatedAt: T(11) },
    { id: 3, caseNumber: "CASE-100", createdAt: T(1), updatedAt: T(15) },
    { id: 4, caseNumber: "CASE-2", createdAt: T(12), updatedAt: T(25) },
    { id: 5, caseNumber: "CASE-99", createdAt: T(3), updatedAt: T(12) },
  ];
}

describe("the three-click cycle", () => {
  it("goes ascending → descending → default on the same column", () => {
    const s1 = nextCaseSort(DEFAULT_CASE_SORT, "caseNumber");
    const s2 = nextCaseSort(s1, "caseNumber");
    const s3 = nextCaseSort(s2, "caseNumber");

    expect(s1).toEqual({ column: "caseNumber", direction: "asc" });
    expect(s2).toEqual({ column: "caseNumber", direction: "desc" });
    expect(s3).toBeNull();
    // …and round again.
    expect(nextCaseSort(s3, "caseNumber")).toEqual({ column: "caseNumber", direction: "asc" });
  });

  it("does the same for Created", () => {
    const s1 = nextCaseSort(null, "createdAt");
    const s2 = nextCaseSort(s1, "createdAt");
    expect(s1).toEqual({ column: "createdAt", direction: "asc" });
    expect(s2).toEqual({ column: "createdAt", direction: "desc" });
    expect(nextCaseSort(s2, "createdAt")).toBeNull();
  });

  it("switching column starts the new column at ascending and clears the old one", () => {
    const fromAsc = nextCaseSort({ column: "caseNumber", direction: "asc" }, "createdAt");
    const fromDesc = nextCaseSort({ column: "caseNumber", direction: "desc" }, "createdAt");
    const back = nextCaseSort({ column: "createdAt", direction: "desc" }, "caseNumber");

    expect(fromAsc).toEqual({ column: "createdAt", direction: "asc" });
    expect(fromDesc).toEqual({ column: "createdAt", direction: "asc" });
    expect(back).toEqual({ column: "caseNumber", direction: "asc" });

    // Only one column shows an indicator.
    expect(caseSortDirection(fromDesc, "createdAt")).toBe("asc");
    expect(caseSortDirection(fromDesc, "caseNumber")).toBeNull();
  });

  it("shows no indicator on either column in the default order", () => {
    expect(caseSortDirection(null, "caseNumber")).toBeNull();
    expect(caseSortDirection(null, "createdAt")).toBeNull();
  });
});

describe("sorting rows", () => {
  it("Case # ascending is numeric, not alphabetical (CASE-9 before CASE-10)", () => {
    const sorted = nums(sortCases(fixture(), { column: "caseNumber", direction: "asc" }));
    expect(sorted).toEqual(["CASE-2", "CASE-9", "CASE-10", "CASE-99", "CASE-100"]);
    // What a text sort would have produced:
    expect([...nums(fixture())].sort()).toEqual(["CASE-10", "CASE-100", "CASE-2", "CASE-9", "CASE-99"]);
  });

  it("Case # descending", () => {
    expect(nums(sortCases(fixture(), { column: "caseNumber", direction: "desc" }))).toEqual([
      "CASE-100",
      "CASE-99",
      "CASE-10",
      "CASE-9",
      "CASE-2",
    ]);
  });

  it("reads zero-padded numbers as numbers", () => {
    expect(caseNumberValue("CASE-009")).toBe(9);
    expect(caseNumberValue("CASE-010")).toBe(10);
    expect(caseNumberValue("CASE-1000")).toBe(1000);
    expect(caseNumberValue("no number")).toBeNull();
    const rows = [
      { id: 1, caseNumber: "CASE-1000", createdAt: T(1), updatedAt: T(1) },
      { id: 2, caseNumber: "CASE-010", createdAt: T(1), updatedAt: T(1) },
      { id: 3, caseNumber: "CASE-009", createdAt: T(1), updatedAt: T(1) },
    ];
    expect(nums(sortCases(rows, { column: "caseNumber", direction: "asc" }))).toEqual([
      "CASE-009",
      "CASE-010",
      "CASE-1000",
    ]);
  });

  it("Created ascending is oldest first, by timestamp", () => {
    expect(nums(sortCases(fixture(), { column: "createdAt", direction: "asc" }))).toEqual([
      "CASE-100", // day 1
      "CASE-99", // day 3
      "CASE-10", // day 5
      "CASE-9", // day 9
      "CASE-2", // day 12
    ]);
  });

  it("Created descending is newest first", () => {
    expect(nums(sortCases(fixture(), { column: "createdAt", direction: "desc" }))).toEqual([
      "CASE-2",
      "CASE-9",
      "CASE-10",
      "CASE-99",
      "CASE-100",
    ]);
  });

  it("compares real instants, not timestamp text", () => {
    // Same instant written two ways, and an offset that sorts wrongly as text.
    const rows = [
      { id: 1, caseNumber: "CASE-1", createdAt: "2026-01-02T01:00:00+05:00", updatedAt: T(1) }, // Jan 1 20:00Z
      { id: 2, caseNumber: "CASE-2", createdAt: "2026-01-01T21:00:00.000Z", updatedAt: T(1) },
    ];
    expect(nums(sortCases(rows, { column: "createdAt", direction: "asc" }))).toEqual(["CASE-1", "CASE-2"]);
  });

  it("the default is Last Modified: updatedAt newest first — not creation order", () => {
    expect(nums(sortCases(fixture(), DEFAULT_CASE_SORT))).toEqual([
      "CASE-2", // updated day 25
      "CASE-10", // day 20
      "CASE-100", // day 15
      "CASE-99", // day 12
      "CASE-9", // day 11
    ]);
  });

  it("the third click restores exactly the default order", () => {
    let sort: CaseSort = null;
    const initial = ids(sortCases(fixture(), sort));
    for (let i = 0; i < 3; i++) sort = nextCaseSort(sort, "createdAt");
    expect(ids(sortCases(fixture(), sort))).toEqual(initial);

    for (let i = 0; i < 3; i++) sort = nextCaseSort(sort, "caseNumber");
    expect(ids(sortCases(fixture(), sort))).toEqual(initial);
  });

  it("orders identical timestamps deterministically, whatever the input order", () => {
    const same = T(7);
    const rows: SortableCase[] = [
      { id: 7, caseNumber: "CASE-7", createdAt: same, updatedAt: same },
      { id: 12, caseNumber: "CASE-12", createdAt: same, updatedAt: same },
      { id: 3, caseNumber: "CASE-3", createdAt: same, updatedAt: same },
    ];
    const reversed = [...rows].reverse();

    const createdAsc = { column: "createdAt", direction: "asc" } as const;
    const createdDesc = { column: "createdAt", direction: "desc" } as const;
    expect(nums(sortCases(rows, createdAsc))).toEqual(["CASE-3", "CASE-7", "CASE-12"]);
    expect(nums(sortCases(reversed, createdAsc))).toEqual(["CASE-3", "CASE-7", "CASE-12"]);
    expect(nums(sortCases(rows, createdDesc))).toEqual(["CASE-12", "CASE-7", "CASE-3"]);
    // Default: equal updatedAt → lowest case number first, as the server does.
    expect(nums(sortCases(rows, null))).toEqual(["CASE-3", "CASE-7", "CASE-12"]);
    expect(nums(sortCases(reversed, null))).toEqual(["CASE-3", "CASE-7", "CASE-12"]);
  });

  it("keeps every row exactly once", () => {
    for (const sort of [
      null,
      { column: "caseNumber", direction: "asc" },
      { column: "caseNumber", direction: "desc" },
      { column: "createdAt", direction: "asc" },
      { column: "createdAt", direction: "desc" },
    ] as CaseSort[]) {
      expect(ids(sortCases(fixture(), sort)).sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("does not modify the input array or the records in it", () => {
    const rows = fixture();
    const snapshot = JSON.parse(JSON.stringify(rows));
    const out = sortCases(rows, { column: "caseNumber", direction: "desc" });

    expect(out).not.toBe(rows);
    expect(rows).toEqual(snapshot);
    // Same record objects, only reordered.
    expect(out.every((r) => rows.includes(r))).toBe(true);
  });
});

describe("with real API data", () => {
  const list = async (query: Record<string, string> = {}) =>
    (await request(app).get("/api/cases").query(query).set(asMe).expect(200)).body;

  it("default order matches the server's Last Modified order, and follows edits", async () => {
    const a = (await request(app).post("/api/cases").set(asMe).send({ title: "Sort A", accountId: 1 }).expect(201)).body;
    await new Promise((r) => setTimeout(r, 5));
    const b = (await request(app).post("/api/cases").set(asMe).send({ title: "Sort B", accountId: 1 }).expect(201)).body;
    await new Promise((r) => setTimeout(r, 5));
    // A is older but was modified last.
    await request(app).patch(`/api/cases/${a.id}`).set(asMe).send({ priority: "high" }).expect(200);

    const rows = await list();
    const sorted = sortCases(rows, null);
    expect(sorted[0].id).toBe(a.id);
    expect(sorted[1].id).toBe(b.id);
    // Identical to the server's order — including the seeded cases that share
    // an updatedAt, where the tie-break has to match too.
    expect(ids(sorted)).toEqual(ids(rows));
    const stamps = rows.map((r: any) => r.updatedAt);
    expect(new Set(stamps).size).toBeLessThan(stamps.length);
  });

  it("Case # and Created orders hold across all cases", async () => {
    const rows = await list();
    const byNum = sortCases(rows, { column: "caseNumber", direction: "asc" });
    for (let i = 1; i < byNum.length; i++) {
      expect(caseNumberValue(byNum[i - 1].caseNumber)!).toBeLessThan(caseNumberValue(byNum[i].caseNumber)!);
    }
    const byCreated = sortCases(rows, { column: "createdAt", direction: "desc" });
    for (let i = 1; i < byCreated.length; i++) {
      expect(Date.parse(byCreated[i - 1].createdAt)).toBeGreaterThanOrEqual(Date.parse(byCreated[i].createdAt));
    }
  });

  it("sorts only what the filters returned", async () => {
    const intake = await list({ status: "intake" });
    const all = await list();
    expect(intake.length).toBeGreaterThan(1);
    expect(intake.length).toBeLessThan(all.length);

    const sorted = sortCases(intake, { column: "caseNumber", direction: "desc" });
    expect(sorted.every((c: any) => c.status === "intake")).toBe(true);
    expect(ids(sorted).sort()).toEqual(ids(intake).sort());
    for (let i = 1; i < sorted.length; i++) {
      expect(caseNumberValue(sorted[i - 1].caseNumber)!).toBeGreaterThan(caseNumberValue(sorted[i].caseNumber)!);
    }

    const searched = await list({ search: "Sort" });
    expect(searched.length).toBeGreaterThanOrEqual(2);
    const s = sortCases(searched, { column: "createdAt", direction: "asc" });
    expect(s.every((c: any) => c.title.includes("Sort") || (c.description ?? "").includes("Sort"))).toBe(true);
  });

  it("sorting leaves the stored cases and their timestamps untouched", async () => {
    const before = await list();
    for (const sort of [
      { column: "caseNumber", direction: "asc" },
      { column: "createdAt", direction: "desc" },
      null,
    ] as CaseSort[]) {
      sortCases(before, sort);
    }
    const after = await list();
    expect(after).toEqual(before);
  });
});
