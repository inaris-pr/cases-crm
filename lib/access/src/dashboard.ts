/**
 * The personalized Dashboard's permission rules (RBAC Phase 6), shared by
 * the API (which sections GET /api/dashboard returns) and the web app
 * (which widgets it renders).
 *
 * A widget is rendered only when all its requirements hold, and every
 * widget's requirements include its section's, so the server always returns
 * the data a rendered widget reads — a widget never appears and then
 * disappears on a 403.
 */
import type { Permission, Scope } from "./permissions";
import { can, type EffectivePermissions } from "./resolve";

export interface DashboardRequirement {
  permission: Permission;
  /** The permission must be held at least at this scope. */
  minScope?: Scope;
}

export const DASHBOARD_SECTIONS = ["cases", "calls", "leads", "accounts", "people", "communication"] as const;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

export interface DashboardWidgetSpec {
  /** ALL must be satisfied for the widget to exist for this employee. */
  requires: readonly DashboardRequirement[];
  /** The response section the widget reads. */
  section: DashboardSection;
}

const CASES: DashboardRequirement[] = [{ permission: "metrics.cases" }, { permission: "cases.view" }];
const CALLS: DashboardRequirement[] = [{ permission: "metrics.calls" }, { permission: "cases.view" }];
const SALES: DashboardRequirement[] = [{ permission: "metrics.sales" }, { permission: "leads.view" }];
const ACCOUNTS: DashboardRequirement[] = [{ permission: "metrics.sales" }, { permission: "accounts.view" }];
const PEOPLE: DashboardRequirement[] = [{ permission: "metrics.people" }, { permission: "people.view" }];
const MESSAGES: DashboardRequirement[] = [{ permission: "messages.use" }];

/**
 * What each section of GET /api/dashboard needs. The section's figures are
 * computed at the scope of its first (metrics) permission.
 *   cases          case figures, workload, attention lists
 *   calls          manually logged calls/contacts, by who logged them
 *   leads          lead figures by current status
 *   accounts       accounts owned in the sales scope, linked clients
 *   people         employee aggregates and team structure — never customer data
 *   communication  the employee's own mentions and conversations
 */
export const DASHBOARD_SECTION_REQUIREMENTS: Record<DashboardSection, readonly DashboardRequirement[]> = {
  cases: CASES,
  calls: CALLS,
  leads: SALES,
  accounts: ACCOUNTS,
  people: PEOPLE,
  communication: MESSAGES,
};

function meets(permissions: EffectivePermissions, reqs: readonly DashboardRequirement[]): boolean {
  return reqs.every((r) => can(permissions, r.permission, r.minScope));
}

export function dashboardSectionAllowed(permissions: EffectivePermissions, section: DashboardSection): boolean {
  return meets(permissions, DASHBOARD_SECTION_REQUIREMENTS[section]);
}

export const DASHBOARD_WIDGETS = {
  "case-summary": { requires: CASES, section: "cases" },
  "lead-summary": { requires: SALES, section: "leads" },
  "people-summary": { requires: PEOPLE, section: "people" },
  "case-attention": { requires: CASES, section: "cases" },
  "case-escalations": { requires: CASES, section: "cases" },
  "case-least-recent": { requires: CASES, section: "cases" },
  "case-workload": {
    requires: [{ permission: "metrics.cases", minScope: "team" }, { permission: "cases.view" }],
    section: "cases",
  },
  "case-breakdown": { requires: CASES, section: "cases" },
  "case-categories": {
    requires: [{ permission: "metrics.cases", minScope: "team" }, { permission: "cases.view" }],
    section: "cases",
  },
  "case-recent": { requires: CASES, section: "cases" },
  "case-activity": { requires: CASES, section: "cases" },
  "case-trend": { requires: CASES, section: "cases" },
  calls: { requires: CALLS, section: "calls" },
  "lead-pipeline": { requires: SALES, section: "leads" },
  "lead-recent": { requires: SALES, section: "leads" },
  "lead-workload": {
    requires: [{ permission: "metrics.sales", minScope: "team" }, { permission: "leads.view" }],
    section: "leads",
  },
  accounts: { requires: ACCOUNTS, section: "accounts" },
  "people-distribution": { requires: PEOPLE, section: "people" },
  "people-teams": { requires: PEOPLE, section: "people" },
  mentions: { requires: MESSAGES, section: "communication" },
  conversations: { requires: MESSAGES, section: "communication" },
} as const satisfies Record<string, DashboardWidgetSpec>;

export type DashboardWidgetId = keyof typeof DASHBOARD_WIDGETS;
export const DASHBOARD_WIDGET_IDS = Object.keys(DASHBOARD_WIDGETS) as DashboardWidgetId[];

export function dashboardWidgetAllowed(permissions: EffectivePermissions, id: DashboardWidgetId): boolean {
  const spec: DashboardWidgetSpec = DASHBOARD_WIDGETS[id];
  return meets(permissions, spec.requires);
}

/** The widgets this employee sees, in dashboard order. */
export function visibleDashboardWidgets(permissions: EffectivePermissions): DashboardWidgetId[] {
  return DASHBOARD_WIDGET_IDS.filter((id) => dashboardWidgetAllowed(permissions, id));
}
