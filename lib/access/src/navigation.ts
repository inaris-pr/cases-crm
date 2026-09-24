/**
 * Navigation metadata (architecture plan, Revision 1, §R6): which sidebar
 * items, sections and routes each permission unlocks.
 *
 * Phase 2 defines this; the web app starts using it in Phase 5. The API
 * remains the authority on data — hiding something here is never the only
 * protection.
 *
 * A section is "live" when the page for it exists today, or "planned" when
 * it arrives in a later phase. Planned sections never make an item visible
 * (decision D20: no placeholder content).
 */
import { canAny, type EffectivePermissions } from "./resolve";
import type { Permission } from "./permissions";

export type SectionStatus = "live" | "planned";

export interface NavSection {
  id: string;
  label: string;
  /** Visible when the user holds ANY of these. */
  requires: readonly Permission[];
  status: SectionStatus;
  href?: string;
}

export interface NavItem {
  id: "dashboard" | "leads" | "records" | "insights" | "messages" | "knowledge" | "accounting" | "settings";
  label: string;
  /** Null for the external Knowledge Base link (its URL is configuration). */
  href: string | null;
  external?: boolean;
  /** For items without sections: visible when the user holds ANY of these. */
  requires?: readonly Permission[];
  /** For items with sections: visible when at least one live section is. */
  sections?: readonly NavSection[];
}

export const RECORDS_TAB_SECTIONS: readonly NavSection[] = [
  { id: "accounts", label: "Accounts", requires: ["accounts.view"], status: "live", href: "/records/accounts" },
  { id: "clients", label: "Clients", requires: ["contacts.view"], status: "live", href: "/records/clients" },
  { id: "cases", label: "Cases", requires: ["cases.view"], status: "live", href: "/records/cases" },
];

export const INSIGHTS_SECTIONS: readonly NavSection[] = [
  { id: "cases", label: "Cases", requires: ["insights.cases.view"], status: "live" },
  { id: "sales", label: "Sales", requires: ["insights.sales.view"], status: "planned" },
  { id: "people", label: "People", requires: ["insights.people.view"], status: "planned" },
];

/**
 * Accounting tabs (a front-end prototype with sample data — no API yet).
 * The statements need accounting.view; Payroll alone needs
 * accounting.payroll.view (HR).
 */
export const ACCOUNTING_SECTIONS: readonly NavSection[] = [
  { id: "ledger", label: "Ledger", requires: ["accounting.view"], status: "live" },
  { id: "trial", label: "Trial balance", requires: ["accounting.view"], status: "live" },
  { id: "balance", label: "Balance sheet", requires: ["accounting.view"], status: "live" },
  { id: "pl", label: "P&L", requires: ["accounting.view"], status: "live" },
  { id: "cashflow", label: "Cash flow", requires: ["accounting.view"], status: "live" },
  { id: "payroll", label: "Payroll", requires: ["accounting.payroll.view"], status: "live" },
];

/**
 * Personal settings, in the account menu (/account), not the sidebar.
 * Everyone signed in gets the first three (requires: []); API Keys is a
 * privileged integration setting (System Owner).
 */
export const PERSONAL_SECTIONS: readonly NavSection[] = [
  { id: "profile", label: "Profile", requires: [], status: "live" },
  { id: "notifications", label: "Notifications", requires: [], status: "live" },
  { id: "security", label: "Security", requires: [], status: "live" },
  { id: "api_keys", label: "API Keys", requires: ["system.integrations.manage"], status: "live" },
];

/** The personal settings cards this employee sees (empty `requires` = everyone). */
export function visiblePersonalSections(perms: EffectivePermissions): NavSection[] {
  return PERSONAL_SECTIONS.filter((s) => s.requires.length === 0 || canAny(perms, s.requires));
}

/**
 * Settings (§R3). Personal settings (own profile, notifications, password)
 * need no permission and live in the account menu, not here.
 */
export const SETTINGS_SECTIONS: readonly NavSection[] = [
  { id: "teams", label: "Divisions & teams", requires: ["settings.teams.view"], status: "live" },
  { id: "team_config", label: "Team configuration", requires: ["settings.team_config.manage"], status: "planned" },
  { id: "pipelines", label: "Pipeline stages", requires: ["settings.pipelines.manage"], status: "live" },
  { id: "case_config", label: "Case configuration", requires: ["settings.case_config.manage"], status: "planned" },
  { id: "company", label: "Company config", requires: ["settings.company.manage"], status: "live" },
  // Includes the "Invite users" prototype, hidden until the People phase.
  { id: "people", label: "People", requires: ["people.view", "people.manage"], status: "planned" },
  { id: "security", label: "Security", requires: ["system.security.manage"], status: "planned" },
  { id: "integrations", label: "Integrations & API keys", requires: ["system.integrations.manage"], status: "planned" },
  { id: "data", label: "Danger zone", requires: ["system.data.manage"], status: "live" },
  { id: "audit", label: "Audit log", requires: ["system.audit.view"], status: "planned" },
];

/** Sidebar order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/", requires: ["dashboard.view"] },
  { id: "leads", label: "Leads", href: "/leads", requires: ["leads.view"] },
  { id: "records", label: "Records", href: "/records", sections: RECORDS_TAB_SECTIONS },
  { id: "insights", label: "Insights", href: "/insights", sections: INSIGHTS_SECTIONS },
  { id: "messages", label: "Messages", href: "/messages", requires: ["messages.use"] },
  { id: "knowledge", label: "Knowledge Base", href: null, external: true, requires: ["knowledge.view"] },
  { id: "accounting", label: "Accounting", href: "/accounting", sections: ACCOUNTING_SECTIONS },
  { id: "settings", label: "Settings", href: "/settings", sections: SETTINGS_SECTIONS },
];

export function visibleSections(
  sections: readonly NavSection[],
  perms: EffectivePermissions,
  opts: { includePlanned?: boolean } = {},
): NavSection[] {
  return sections.filter(
    (s) => (opts.includePlanned || s.status === "live") && canAny(perms, s.requires),
  );
}

export interface VisibleNavItem extends NavItem {
  href: string | null;
  visibleSections?: NavSection[];
}

/**
 * The sidebar for these permissions. The Knowledge Base item appears only
 * when its URL is configured (D12). Records links to the first tab the user
 * may open.
 */
export function visibleNavItems(
  perms: EffectivePermissions,
  opts: { knowledgeBaseUrl?: string | null } = {},
): VisibleNavItem[] {
  const out: VisibleNavItem[] = [];
  for (const item of NAV_ITEMS) {
    if (item.sections) {
      const sections = visibleSections(item.sections, perms);
      if (sections.length === 0) continue;
      const href = item.id === "records" ? sections[0].href ?? item.href : item.href;
      out.push({ ...item, href, visibleSections: sections });
      continue;
    }
    if (!canAny(perms, item.requires ?? [])) continue;
    if (item.id === "knowledge") {
      if (!opts.knowledgeBaseUrl) continue;
      out.push({ ...item, href: opts.knowledgeBaseUrl });
      continue;
    }
    out.push({ ...item });
  }
  return out;
}

/** The Records tabs this user may open, in order. */
export function visibleRecordsTabs(perms: EffectivePermissions): string[] {
  return visibleSections(RECORDS_TAB_SECTIONS, perms).map((s) => s.id);
}

// ── Routes ──────────────────────────────────────────────────────────────────

export interface RouteAccess {
  /** A Wouter-style path; `:param` matches one segment. */
  path: string;
  /** Opening the route needs ANY of these. Empty = only a redirect. */
  requires: readonly Permission[];
  /** Redirect-only routes are guarded by their destination. */
  redirect?: boolean;
  /** Open to every signed-in employee (e.g. their own account settings). */
  signedIn?: boolean;
}

/** Permissions that unlock at least one live section. */
function liveRequirements(sections: readonly NavSection[]): Permission[] {
  return [...new Set(sections.filter((s) => s.status === "live").flatMap((s) => s.requires))];
}

/** Every route in artifacts/cases/src/App.tsx and what opening it needs. */
export const ROUTE_ACCESS: readonly RouteAccess[] = [
  { path: "/", requires: ["dashboard.view"] },
  { path: "/leads", requires: ["leads.view"] },
  { path: "/records", requires: liveRequirements(RECORDS_TAB_SECTIONS), redirect: true },
  { path: "/records/accounts", requires: ["accounts.view"] },
  { path: "/records/clients", requires: ["contacts.view"] },
  { path: "/records/cases", requires: ["cases.view"] },
  { path: "/accounts", requires: [], redirect: true },
  { path: "/clients", requires: [], redirect: true },
  { path: "/contacts", requires: [], redirect: true },
  { path: "/customers", requires: [], redirect: true },
  { path: "/cases", requires: [], redirect: true },
  { path: "/workflow", requires: [], redirect: true },
  { path: "/accounts/:id", requires: ["accounts.view"] },
  { path: "/clients/:id", requires: ["contacts.view"] },
  { path: "/contacts/:id", requires: ["contacts.view"] },
  { path: "/cases/:id", requires: ["cases.view"] },
  { path: "/insights", requires: liveRequirements(INSIGHTS_SECTIONS) },
  { path: "/accounting", requires: liveRequirements(ACCOUNTING_SECTIONS) },
  { path: "/settings", requires: liveRequirements(SETTINGS_SECTIONS) },
  { path: "/messages", requires: ["messages.use"] },
  { path: "/account", requires: [], signedIn: true },
];

function matches(pattern: string, path: string): boolean {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("?")[0].split("#")[0].split("/").filter(Boolean);
  return a.length === b.length && a.every((seg, i) => seg.startsWith(":") || seg === b[i]);
}

export function routeAccessFor(path: string): RouteAccess | null {
  // Exact segments beat parameters: "/records/cases" before "/records/:tab"-style entries.
  const exact = ROUTE_ACCESS.find((r) => !r.path.includes(":") && matches(r.path, path));
  return exact ?? ROUTE_ACCESS.find((r) => matches(r.path, path)) ?? null;
}

/**
 * Whether these permissions may open `path`. Unknown paths and redirect-only
 * routes return true here (the destination, or the Not Found page, decides).
 */
export function canOpenRoute(perms: EffectivePermissions, path: string): boolean {
  const access = routeAccessFor(path);
  if (!access || access.redirect || access.signedIn) return true;
  return canAny(perms, access.requires);
}
