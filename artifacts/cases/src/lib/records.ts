/**
 * The Records workspace: one sidebar entry, three tabs.
 *
 * This module is the single source of truth for Records URLs — App.tsx builds
 * its routes and redirects from it, and the Sidebar uses it to decide when
 * Records is active.
 *
 * It deliberately imports nothing — no React, no DOM, no "@/" alias — so the
 * routing contract can be unit-tested from the API server's Vitest suite,
 * which is the only test harness in this repository.
 */

export const RECORDS_TABS = ["accounts", "clients", "cases"] as const;
export type RecordsTab = (typeof RECORDS_TABS)[number];

/** Opening Records without a tab lands on the first one. */
export const DEFAULT_RECORDS_TAB: RecordsTab = "accounts";

export const RECORDS_TAB_LABELS: Record<RecordsTab, string> = {
  accounts: "Accounts",
  clients: "Clients",
  cases: "Cases",
};

export const RECORDS_BASE = "/records";

export function isRecordsTab(value: unknown): value is RecordsTab {
  return typeof value === "string" && (RECORDS_TABS as readonly string[]).includes(value);
}

/** The URL of a Records tab. The tab lives in the path, so it survives a refresh. */
export function recordsPath(tab: RecordsTab = DEFAULT_RECORDS_TAB): string {
  return `${RECORDS_BASE}/${tab}`;
}

/**
 * The old list URLs and the tab that replaced each, so existing bookmarks and
 * links keep working.
 *
 * Detail URLs — /accounts/:id, /clients/:id, /contacts/:id, /cases/:id — are
 * deliberately NOT here. Those pages are unchanged and keep their own routes.
 */
export const LEGACY_LIST_ROUTES: ReadonlyArray<readonly [string, RecordsTab]> = [
  ["/accounts", "accounts"],
  ["/clients", "clients"],
  ["/contacts", "clients"],
  ["/customers", "clients"],
  ["/cases", "cases"],
];

/** Detail pages that belong to Records, so the sidebar stays lit on them. */
const RECORD_DETAIL_PREFIXES = ["/accounts/", "/clients/", "/contacts/", "/cases/"] as const;

/** True for the workspace, its old list URLs and every record detail page. */
export function isRecordsLocation(pathname: string): boolean {
  if (pathname === RECORDS_BASE || pathname.startsWith(`${RECORDS_BASE}/`)) return true;
  if (LEGACY_LIST_ROUTES.some(([from]) => pathname === from)) return true;
  return RECORD_DETAIL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
