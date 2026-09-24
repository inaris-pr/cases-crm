/**
 * The permission catalog (architecture plan, Revision 1, §R2–§R5).
 *
 * A permission is a capability. A *scoped* permission is also granted with a
 * data scope — whose records it applies to:
 *
 *   own  — records I own (or authored)
 *   team — mine plus those owned by members of teams I supervise
 *   all  — company-wide
 *
 * Unscoped permissions are simply held or not.
 */

export const SCOPES = ["own", "team", "all"] as const;
export type Scope = (typeof SCOPES)[number];

/** own < team < all */
export const SCOPE_RANK: Record<Scope, number> = { own: 1, team: 2, all: 3 };

export function widerScope(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

export interface PermissionDef {
  scoped: boolean;
  area: PermissionArea;
  description: string;
}

export type PermissionArea =
  | "dashboard"
  | "leads"
  | "accounts"
  | "contacts"
  | "cases"
  | "automations"
  | "insights"
  | "metrics"
  | "communication"
  | "accounting"
  | "settings"
  | "people"
  | "system";

const def = <S extends boolean>(area: PermissionArea, scoped: S, description: string) => ({
  scoped,
  area,
  description,
});

export const PERMISSIONS = {
  "dashboard.view": def("dashboard", false, "Open the dashboard"),

  "leads.view": def("leads", true, "See leads"),
  "leads.create": def("leads", false, "Create leads"),
  "leads.edit": def("leads", true, "Edit lead details"),
  "leads.convert": def("leads", true, "Convert a lead into an Account and Client"),
  "leads.assign": def("leads", true, "Change a lead's owner"),
  "leads.delete": def("leads", true, "Delete leads"),

  "accounts.view": def("accounts", true, "See accounts (non-sensitive fields)"),
  "accounts.view.regulatory_ids": def("accounts", false, "See full EIN and FinCEN identifiers"),
  "accounts.view.financial": def("accounts", false, "See Stripe, banking and payment identifiers"),
  "accounts.create": def("accounts", false, "Create accounts directly (not via lead conversion)"),
  "accounts.edit.profile": def("accounts", true, "Edit account profile and contact fields (AG1)"),
  "accounts.edit.service": def("accounts", true, "Edit service and subscription fields (AG2)"),
  "accounts.edit.formation": def("accounts", true, "Edit formation and compliance fields (AG3)"),
  "accounts.edit.regulatory_ids": def("accounts", true, "Edit EIN and FinCEN fields (AG4)"),
  "accounts.edit.financial": def("accounts", true, "Edit payment and banking fields (AG5)"),
  "accounts.edit.system": def("accounts", true, "Edit system-managed fields (AG6)"),
  "accounts.assign": def("accounts", true, "Change an account's owner"),
  "accounts.archive": def("accounts", true, "Archive or restore accounts"),

  "contacts.view": def("contacts", true, "See clients"),
  "contacts.create": def("contacts", false, "Create clients"),
  "contacts.edit": def("contacts", true, "Edit client details"),
  "contacts.assign": def("contacts", true, "Change a client's owner"),
  "contacts.link": def("contacts", false, "Link and unlink clients and accounts"),

  "cases.view": def("cases", true, "See cases"),
  "cases.work": def("cases", true, "Log calls, comment, and manage tasks and documents on cases"),
  "cases.create": def("cases", false, "Create cases"),
  "cases.edit": def("cases", true, "Change a case's status, priority, fields and relationships"),
  "cases.assign": def("cases", true, "Reassign cases"),

  "automations.edit": def("automations", true, "Create and edit a case's own automations"),
  "automations.manage_global": def("automations", false, "Create, edit, apply and delete global automations"),

  "insights.cases.view": def("insights", true, "Case and call analytics on the Insights page"),
  "insights.sales.view": def("insights", true, "Lead and conversion analytics on the Insights page"),
  "insights.people.view": def("insights", true, "Employee (HR) analytics on the Insights page — never customer, case or sales data"),

  "metrics.cases": def("metrics", true, "Case figures on the dashboard"),
  "metrics.calls": def("metrics", true, "Call-record figures on the dashboard"),
  "metrics.sales": def("metrics", true, "Sales figures on the dashboard"),
  "metrics.sales.leaderboard": def("metrics", false, "Team leaderboard: conversions and companies created only"),
  "metrics.people": def("metrics", true, "Employee (HR) figures on the dashboard"),

  "messages.use": def("communication", false, "Use internal messages"),
  "knowledge.view": def("communication", false, "Open the Knowledge Base link"),

  "accounting.view": def("accounting", false, "Accounting ledger and statements"),
  "accounting.payroll.view": def("accounting", false, "Accounting → Payroll"),

  "settings.teams.view": def("settings", true, "See teams, members and supervisors"),
  "settings.teams.manage": def("settings", true, "Manage membership of teams one supervises"),
  "settings.team_config.manage": def("settings", true, "Team-level operational configuration"),
  "settings.pipelines.manage": def("settings", false, "Pipeline and workflow stages"),
  "settings.case_config.manage": def("settings", false, "Company-wide case configuration"),
  "settings.company.manage": def("settings", false, "Company branding and appearance"),

  "people.view": def("people", true, "Employee directory: roles, departments, teams"),
  "people.manage": def("people", false, "Invite and deactivate employees; assign non-privileged roles and teams"),

  "system.security.manage": def("system", false, "Authentication, session and password settings"),
  "system.roles.grant_privileged": def("system", false, "Grant or revoke System Owner"),
  "system.integrations.manage": def("system", false, "API keys, integration credentials, external URLs"),
  "system.data.manage": def("system", false, "Workspace-level destructive operations, backups, bulk export"),
  "system.audit.view": def("system", false, "Security audit log"),
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export type ScopedPermission = {
  [K in Permission]: (typeof PERMISSIONS)[K]["scoped"] extends true ? K : never;
}[Permission];
export type UnscopedPermission = Exclude<Permission, ScopedPermission>;

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

export function isScoped(p: Permission): p is ScopedPermission {
  return PERMISSIONS[p].scoped;
}
