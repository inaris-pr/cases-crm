/**
 * Role and department vocabulary (architecture plan, Revision 1, §R1).
 *
 * Keys are stored on employees and never shown; labels are what people see
 * and can change without a data migration.
 */

export const ROLE_KEYS = [
  "csr",
  "csr_supervisor",
  "business_advisor",
  "business_advisor_supervisor",
  "operations_admin",
  "operations_admin_supervisor",
  "hr",
  "system_owner",
  // Reserved — defined, but granted nothing until their access is decided.
  "filing",
  "filing_supervisor",
  "partner",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/** Roles that exist but deliberately grant no permissions yet (D18 and Filing). */
export const RESERVED_ROLE_KEYS: readonly RoleKey[] = ["filing", "filing_supervisor", "partner"];

export const ROLE_LABELS: Record<RoleKey, string> = {
  csr: "CSR",
  csr_supervisor: "CSR Supervisor",
  business_advisor: "Business Advisor",
  business_advisor_supervisor: "Business Advisor Supervisor",
  operations_admin: "Admin",
  operations_admin_supervisor: "Admin Supervisor",
  hr: "HR",
  system_owner: "System Owner",
  filing: "Filing",
  filing_supervisor: "Filing Supervisor",
  partner: "Partner",
};

/** Roles that only someone with system.roles.grant_privileged may grant. */
export const PRIVILEGED_ROLE_KEYS: readonly RoleKey[] = ["system_owner"];

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === "string" && (ROLE_KEYS as readonly string[]).includes(value);
}

export const DEPARTMENT_KEYS = [
  "customer_service",
  "business_advisors",
  "operations",
  "hr",
  "filing",
  "partners",
] as const;
export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

export const DEPARTMENT_LABELS: Record<DepartmentKey, string> = {
  customer_service: "Customer Service",
  business_advisors: "Business Advisors",
  operations: "Operations",
  hr: "HR",
  filing: "Filing",
  partners: "Partners",
};
