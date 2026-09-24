/**
 * Employee identity data: the legacy-role mapping, the demo employees and
 * teams, and the public shape of a user. Role keys, labels and permissions
 * come from the shared lib/access package (architecture plan, Revision 1).
 */

// The role and department vocabulary now lives in the shared permission
// package (lib/access); re-exported here so existing imports keep working.
import type { DepartmentKey, RoleKey } from "../access.js";
export { DEPARTMENT_KEYS, ROLE_KEYS, isRoleKey } from "../access.js";
export type { DepartmentKey, RoleKey } from "../access.js";

/**
 * The pre-Phase-1 `User.role` values and what they become (decision D1).
 * No legacy value maps to operations_admin: legacy "admin" meant the owner
 * account (Iris), not the back-office Admin role.
 */
export const LEGACY_ROLE_MAP: Record<string, RoleKey[]> = {
  admin: ["system_owner"],
  case_manager: ["csr"],
};

/** Department implied by a user's first role, for migrated users. */
export const DEPARTMENT_FOR_ROLE: Record<RoleKey, DepartmentKey | null> = {
  csr: "customer_service",
  csr_supervisor: "customer_service",
  business_advisor: "business_advisors",
  business_advisor_supervisor: "business_advisors",
  operations_admin: "operations",
  operations_admin_supervisor: "operations",
  hr: "hr",
  system_owner: null,
  filing: "filing",
  filing_supervisor: "filing",
  partner: "partners",
};

/** Prototype password for demo employees. Only ever stored hashed. */
export const DEMO_PASSWORD = "test123";

export interface DemoEmployeeSpec {
  name: string;
  email: string;
  roles: RoleKey[];
  departmentKey: DepartmentKey | null;
}

/** Demo employees added by the identity migration (decision B2). */
export const DEMO_EMPLOYEES: readonly DemoEmployeeSpec[] = [
  { name: "Nadia Flores", email: "nadia@example.com", roles: ["csr_supervisor"], departmentKey: "customer_service" },
  { name: "Leo Martinez", email: "leo@example.com", roles: ["business_advisor"], departmentKey: "business_advisors" },
  { name: "Grace Kim", email: "grace@example.com", roles: ["business_advisor_supervisor"], departmentKey: "business_advisors" },
  { name: "Omar Haddad", email: "omar@example.com", roles: ["operations_admin"], departmentKey: "operations" },
  { name: "Rachel Stein", email: "rachel@example.com", roles: ["operations_admin_supervisor"], departmentKey: "operations" },
  { name: "Tessa Nguyen", email: "tessa@example.com", roles: ["hr"], departmentKey: "hr" },
];

export interface DemoTeamSpec {
  name: string;
  departmentKey: DepartmentKey;
  memberEmails: string[];
  supervisorEmails: string[];
}

/** Demo teams (B2 + the Operations team). Groundwork for Phase 4 team scope. */
export const DEMO_TEAMS: readonly DemoTeamSpec[] = [
  {
    name: "Customer Service",
    departmentKey: "customer_service",
    memberEmails: ["devon@example.com", "sara@example.com"],
    supervisorEmails: ["nadia@example.com"],
  },
  {
    name: "Business Advisors",
    departmentKey: "business_advisors",
    memberEmails: ["leo@example.com"],
    supervisorEmails: ["grace@example.com"],
  },
  {
    name: "Operations",
    departmentKey: "operations",
    memberEmails: ["omar@example.com"],
    supervisorEmails: ["rachel@example.com"],
  },
];

/** The fields of a user that may leave the server. Never the password hash. */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  roles: RoleKey[];
  departmentKey: DepartmentKey | null;
  active: boolean;
  demo: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function publicUser(u: PublicUser): PublicUser {
  // Explicit allow-list: a field added to User later is private until listed.
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    roles: [...u.roles],
    departmentKey: u.departmentKey,
    active: u.active,
    demo: u.demo,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}
