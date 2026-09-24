import { store, nextUserId } from "../../src/store";
import type { RoleKey } from "../../src/access";
import { hashPasswordSync } from "../../src/auth/password";
import { SESSION_COOKIE_NAME, createSession } from "../../src/auth/sessions";
import { loginAs } from "./app";

/**
 * One signed-in session per role, for authorization tests.
 * Demo employees sign in through the real endpoint; roles without a demo
 * employee (the reserved Filing role) get a test-only employee in this test
 * file's throwaway store.
 */
export const DEMO_EMAIL_FOR_ROLE: Partial<Record<RoleKey, string>> = {
  csr: "devon@example.com",
  csr_supervisor: "nadia@example.com",
  business_advisor: "leo@example.com",
  business_advisor_supervisor: "grace@example.com",
  operations_admin: "omar@example.com",
  operations_admin_supervisor: "rachel@example.com",
  hr: "tessa@example.com",
  system_owner: "iris@example.com",
};

/** Adds an employee with these roles to the test store and opens a session for them. */
export function sessionForNewEmployee(name: string, roles: RoleKey[]): { Cookie: string } {
  const now = new Date().toISOString();
  const user = {
    id: nextUserId(),
    name,
    email: `${name.toLowerCase().replace(/\W+/g, ".")}@test.invalid`,
    passwordHash: hashPasswordSync("not-used-by-this-test"),
    roles,
    departmentKey: null,
    active: true,
    demo: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: now,
  };
  store.users.push(user);
  const { token } = createSession(user.id);
  return { Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

export async function sessionForRole(role: RoleKey): Promise<{ Cookie: string }> {
  const email = DEMO_EMAIL_FOR_ROLE[role];
  return email ? loginAs(email) : sessionForNewEmployee(`Test ${role}`, [role]);
}
