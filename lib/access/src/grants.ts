/**
 * Role bundles — what each role grants (architecture plan, Revision 1:
 * §R5 matrix, §R2.4 Account grants, §R3 Settings grants, §R4 Insights).
 *
 * Supervisor roles are listed in full rather than derived from their base
 * role, so each row reads exactly like the approved matrix. Reserved roles
 * grant nothing. System Owner holds every permission (computed, so a new
 * permission can never be forgotten there).
 *
 * The permission-matrix test asserts every cell of this table.
 */
import { PERMISSION_KEYS, PERMISSIONS, type Permission, type Scope } from "./permissions";
import type { RoleKey } from "./roles";

/** A scoped permission maps to its scope; an unscoped one to `true`. */
export type RoleGrants = Partial<Record<Permission, Scope | true>>;

const A = "all" as const;
const T = "team" as const;
const O = "own" as const;
const Y = true as const;

const EVERYONE_OPERATIONAL: RoleGrants = {
  "dashboard.view": Y,
  "messages.use": Y,
  "knowledge.view": Y,
};

const csr: RoleGrants = {
  ...EVERYONE_OPERATIONAL,
  "accounts.view": A,
  "accounts.edit.profile": A,
  "contacts.view": A,
  "contacts.create": Y,
  "contacts.edit": A,
  "contacts.link": Y,
  "cases.view": A,
  "cases.work": A,
  "cases.create": Y,
  "cases.edit": O,
  "automations.edit": O,
  "metrics.cases": O,
  "metrics.calls": O,
};

const csr_supervisor: RoleGrants = {
  ...EVERYONE_OPERATIONAL,
  "accounts.view": A,
  "accounts.edit.profile": A,
  "contacts.view": A,
  "contacts.create": Y,
  "contacts.edit": A,
  "contacts.link": Y,
  "cases.view": A,
  "cases.work": A,
  "cases.create": Y,
  "cases.edit": T,
  "cases.assign": T,
  "automations.edit": T,
  "insights.cases.view": T,
  "metrics.cases": T,
  "metrics.calls": T,
  "settings.teams.view": T,
  "settings.teams.manage": T,
  "settings.team_config.manage": T,
  "people.view": T,
};

const business_advisor: RoleGrants = {
  ...EVERYONE_OPERATIONAL,
  "leads.view": O,
  "leads.create": Y,
  "leads.edit": O,
  "leads.convert": O,
  "accounts.view": A,
  "accounts.edit.profile": O,
  "accounts.edit.service": O,
  "contacts.view": A,
  "contacts.create": Y,
  "contacts.edit": O,
  "metrics.sales": O,
  "metrics.sales.leaderboard": Y,
};

const business_advisor_supervisor: RoleGrants = {
  ...EVERYONE_OPERATIONAL,
  "leads.view": T,
  "leads.create": Y,
  "leads.edit": T,
  "leads.convert": T,
  "leads.assign": T,
  "leads.delete": T,
  "accounts.view": A,
  "accounts.edit.profile": T,
  "accounts.edit.service": T,
  "accounts.assign": T,
  "contacts.view": A,
  "contacts.create": Y,
  "contacts.edit": T,
  "contacts.assign": T,
  "insights.sales.view": T,
  "metrics.sales": T,
  "metrics.sales.leaderboard": Y,
  "settings.teams.view": T,
  "people.view": T,
};

const operations_admin: RoleGrants = {
  ...EVERYONE_OPERATIONAL,
  "accounts.view": A,
  "accounts.view.regulatory_ids": Y,
  "accounts.create": Y,
  "accounts.edit.profile": A,
  "accounts.edit.formation": A,
  "contacts.view": A,
  "contacts.create": Y,
  "contacts.edit": A,
  "contacts.link": Y,
  "cases.view": A,
  "cases.work": A,
  "cases.create": Y,
  "cases.edit": O,
  "automations.edit": O,
  "metrics.cases": O,
  "metrics.calls": O,
};

const operations_admin_supervisor: RoleGrants = {
  ...EVERYONE_OPERATIONAL,
  "accounts.view": A,
  "accounts.view.regulatory_ids": Y,
  "accounts.create": Y,
  "accounts.edit.profile": A,
  "accounts.edit.service": A,
  "accounts.edit.formation": A,
  "accounts.edit.regulatory_ids": A,
  "accounts.assign": T,
  "accounts.archive": A,
  "contacts.view": A,
  "contacts.create": Y,
  "contacts.edit": A,
  "contacts.assign": T,
  "contacts.link": Y,
  "cases.view": A,
  "cases.work": A,
  "cases.create": Y,
  "cases.edit": A,
  "cases.assign": T,
  "automations.edit": A,
  "automations.manage_global": Y,
  "insights.cases.view": A,
  "metrics.cases": A,
  "metrics.calls": A,
  "settings.teams.view": A,
  "settings.teams.manage": T,
  "settings.team_config.manage": A,
  "settings.pipelines.manage": Y,
  "settings.case_config.manage": Y,
  "people.view": T,
};

const hr: RoleGrants = {
  ...EVERYONE_OPERATIONAL,
  "insights.people.view": A,
  "metrics.people": A,
  "accounting.payroll.view": Y,
  "settings.teams.view": A,
  "people.view": A,
  "people.manage": Y,
};

/** Every permission; scoped ones company-wide. */
const system_owner: RoleGrants = Object.fromEntries(
  PERMISSION_KEYS.map((p) => [p, PERMISSIONS[p].scoped ? A : Y]),
) as RoleGrants;

export const ROLE_GRANTS: Readonly<Record<RoleKey, Readonly<RoleGrants>>> = {
  csr,
  csr_supervisor,
  business_advisor,
  business_advisor_supervisor,
  operations_admin,
  operations_admin_supervisor,
  hr,
  system_owner,
  filing: {},
  filing_supervisor: {},
  partner: {},
};
