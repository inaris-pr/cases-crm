/**
 * Column sorting for the Cases table (Records → Cases → Table).
 *
 * Two columns sort: Case # and Created. Each header cycles
 *
 *   click 1 → ascending   click 2 → descending   click 3 → default
 *
 * and only one column is active at a time: clicking the other column starts
 * its own cycle at ascending. The default is Last Modified — the case whose
 * `updatedAt` is most recent first — which is also the order GET /api/cases
 * returns.
 *
 * Sorting is purely a view over the rows already fetched (after the server
 * has applied search and filters); it copies the array and never touches the
 * records themselves.
 *
 * Pure module — imports nothing — so the API test suite can exercise it under
 * Node (see api-server/test/case-sort.test.ts).
 */

export type CaseSortColumn = "caseNumber" | "createdAt";
export type CaseSortDirection = "asc" | "desc";

/** `null` means the default order: Last Modified, newest first. */
export type CaseSort = { column: CaseSortColumn; direction: CaseSortDirection } | null;

export const DEFAULT_CASE_SORT: CaseSort = null;

export const CASE_SORT_LABELS: Record<CaseSortColumn, string> = {
  caseNumber: "Case #",
  createdAt: "Created",
};

/** The sort after clicking `column`'s header. */
export function nextCaseSort(current: CaseSort, column: CaseSortColumn): CaseSort {
  if (!current || current.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return DEFAULT_CASE_SORT;
}

/** The direction `column` is sorted in, or null when it is not the active column. */
export function caseSortDirection(sort: CaseSort, column: CaseSortColumn): CaseSortDirection | null {
  return sort && sort.column === column ? sort.direction : null;
}

/** Describes the active order, e.g. for a tooltip or screen reader. */
export function describeCaseSort(sort: CaseSort): string {
  if (!sort) return "Last modified, newest first";
  const label = CASE_SORT_LABELS[sort.column];
  if (sort.column === "caseNumber") {
    return `${label}, ${sort.direction === "asc" ? "lowest first" : "highest first"}`;
  }
  return `${label}, ${sort.direction === "asc" ? "oldest first" : "newest first"}`;
}

/**
 * The number in a case number: "CASE-009" → 9, "CASE-1000" → 1000.
 * Compared as a number, so CASE-9 sorts before CASE-10. Null when there is
 * no number to read.
 */
export function caseNumberValue(caseNumber: string): number | null {
  const m = /(\d+)\D*$/.exec(caseNumber ?? "");
  return m ? Number(m[1]) : null;
}

export interface SortableCase {
  id: number;
  caseNumber: string;
  createdAt: string;
  updatedAt: string;
}

type Dir = 1 | -1;

/** Numeric compare in direction `dir`; missing values (null/NaN) always last. */
function compareNumbers(a: number | null, b: number | null, dir: Dir): number {
  const aMissing = a === null || Number.isNaN(a);
  const bMissing = b === null || Number.isNaN(b);
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  return dir * ((a as number) - (b as number));
}

const time = (iso: string) => Date.parse(iso);

/** By case number (numerically); unreadable numbers last, then by text, then id. */
function byCaseNumber(a: SortableCase, b: SortableCase, dir: Dir): number {
  return (
    compareNumbers(caseNumberValue(a.caseNumber), caseNumberValue(b.caseNumber), dir) ||
    dir * a.caseNumber.localeCompare(b.caseNumber) ||
    dir * (a.id - b.id)
  );
}

/**
 * Returns a sorted COPY of `cases`.
 *
 * Ties are broken deterministically so identical timestamps never make rows
 * jump around between renders:
 *   Created — equal timestamps ordered by case number, in the same direction,
 *             so descending is the exact reverse of ascending.
 *   Default — updatedAt newest first; equal timestamps by case number,
 *             lowest first. That is exactly the order GET /api/cases returns
 *             (a stable sort over store order), so the table's default
 *             looks the same as it did before sorting existed. Seeded data
 *             has several cases sharing one updatedAt, so this matters.
 */
export function sortCases<T extends SortableCase>(cases: readonly T[], sort: CaseSort): T[] {
  const rows = [...cases];

  if (!sort) {
    return rows.sort(
      (a, b) => compareNumbers(time(a.updatedAt), time(b.updatedAt), -1) || byCaseNumber(a, b, 1),
    );
  }

  const dir: Dir = sort.direction === "asc" ? 1 : -1;
  if (sort.column === "caseNumber") return rows.sort((a, b) => byCaseNumber(a, b, dir));
  return rows.sort(
    (a, b) => compareNumbers(time(a.createdAt), time(b.createdAt), dir) || byCaseNumber(a, b, dir),
  );
}
