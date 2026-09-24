import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_GRANTS,
  ROLE_KEYS,
  ROLE_LABELS,
  canAny,
  can,
  canGrantRole,
  resolvePermissions,
  sanitizeEffectivePermissions,
  scopeOf,
  widerScope,
} from "../src/access";
import { ROLE_KEYS as IDENTITY_ROLE_KEYS } from "../src/auth/identity";

/** The permission catalog and resolver in lib/access (Phase 2). */
describe("catalog and bundles", () => {
  it("has the final role keys with product labels (R1)", () => {
    expect([...ROLE_KEYS]).toEqual([
      "csr", "csr_supervisor", "business_advisor", "business_advisor_supervisor",
      "operations_admin", "operations_admin_supervisor", "hr", "system_owner",
      "filing", "filing_supervisor", "partner",
    ]);
    expect(ROLE_LABELS.operations_admin).toBe("Admin");
    expect(ROLE_LABELS.operations_admin_supervisor).toBe("Admin Supervisor");
    expect(ROLE_LABELS.business_advisor).toBe("Business Advisor");
    // The API's identity module uses the same list (no second copy).
    expect(IDENTITY_ROLE_KEYS).toBe(ROLE_KEYS);
  });

  it("uses well-formed, unique permission names", () => {
    for (const p of PERMISSION_KEYS) expect(p).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it("grants scoped permissions with a scope and unscoped ones as true", () => {
    for (const role of ROLE_KEYS) {
      for (const [p, v] of Object.entries(ROLE_GRANTS[role])) {
        const scoped = PERMISSIONS[p as keyof typeof PERMISSIONS].scoped;
        if (scoped) expect(["own", "team", "all"]).toContain(v);
        else expect(v).toBe(true);
      }
    }
  });

  it("gives System Owner every permission, company-wide", () => {
    const perms = resolvePermissions(["system_owner"]);
    expect(Object.keys(perms).sort()).toEqual([...PERMISSION_KEYS].sort());
    for (const p of PERMISSION_KEYS) expect(perms[p]).toBe(PERMISSIONS[p].scoped ? "all" : true);
  });
});

describe("resolvePermissions", () => {
  it("unions several roles, keeping the widest scope", () => {
    const perms = resolvePermissions(["csr", "business_advisor"]);
    expect(perms["cases.edit"]).toBe("own"); // CSR
    expect(perms["leads.view"]).toBe("own"); // Business Advisor
    expect(perms["accounts.edit.profile"]).toBe("all"); // CSR all beats BA own
    expect(perms["contacts.edit"]).toBe("all");

    const both = resolvePermissions(["csr", "csr_supervisor"]);
    expect(both["cases.edit"]).toBe("team");
  });

  it("is independent of role order and repetition", () => {
    const a = resolvePermissions(["business_advisor_supervisor", "csr"]);
    const b = resolvePermissions(["csr", "csr", "business_advisor_supervisor"]);
    expect(a).toEqual(b);
  });

  it("ignores unknown role keys and legacy role names", () => {
    expect(resolvePermissions(["admin", "case_manager", "superuser", ""])).toEqual({});
    expect(resolvePermissions(["nonsense", "hr"])).toEqual(resolvePermissions(["hr"]));
    expect(resolvePermissions([])).toEqual({});
  });

  it("does not share state between calls", () => {
    const first = resolvePermissions(["csr"]);
    (first as any)["leads.view"] = "all";
    expect(resolvePermissions(["csr"])["leads.view"]).toBeUndefined();
  });
});

describe("can / scopeOf / canAny", () => {
  const csr = resolvePermissions(["csr"]);
  const sup = resolvePermissions(["csr_supervisor"]);

  it("checks presence and minimum scope", () => {
    expect(can(csr, "cases.edit")).toBe(true);
    expect(can(csr, "cases.edit", "own")).toBe(true);
    expect(can(csr, "cases.edit", "team")).toBe(false);
    expect(can(sup, "cases.edit", "team")).toBe(true);
    expect(can(sup, "cases.edit", "all")).toBe(false);
    expect(can(csr, "leads.view")).toBe(false);
    expect(can(csr, "messages.use")).toBe(true);
  });

  it("reports the held scope", () => {
    expect(scopeOf(csr, "cases.view")).toBe("all");
    expect(scopeOf(csr, "cases.edit")).toBe("own");
    expect(scopeOf(csr, "leads.view")).toBeNull();
    expect(scopeOf(csr, "messages.use")).toBeNull();
  });

  it("canAny needs at least one", () => {
    expect(canAny(csr, ["leads.view", "cases.view"])).toBe(true);
    expect(canAny(csr, ["leads.view", "accounting.view"])).toBe(false);
    expect(canAny(csr, [])).toBe(false);
  });

  it("orders scopes own < team < all", () => {
    expect(widerScope("own", "team")).toBe("team");
    expect(widerScope("all", "team")).toBe("all");
    expect(widerScope("own", "own")).toBe("own");
  });
});

describe("granting roles (for People management)", () => {
  it("needs people.manage, and System Owner needs the privileged grant", () => {
    const hr = resolvePermissions(["hr"]);
    const owner = resolvePermissions(["system_owner"]);
    const sup = resolvePermissions(["csr_supervisor"]);

    expect(canGrantRole(hr, "csr")).toBe(true);
    expect(canGrantRole(hr, "hr")).toBe(true);
    expect(canGrantRole(hr, "system_owner")).toBe(false); // no self-escalation path
    expect(canGrantRole(owner, "system_owner")).toBe(true);
    expect(canGrantRole(sup, "csr")).toBe(false); // supervisors are not administrators
  });
});

describe("sanitizeEffectivePermissions", () => {
  it("keeps only real permissions with valid values", () => {
    expect(
      sanitizeEffectivePermissions({
        "cases.view": "all",
        "cases.edit": true, // scoped: needs a scope
        "messages.use": "all", // unscoped: needs true
        "leads.view": "everything",
        "made.up": true,
        "dashboard.view": true,
      }),
    ).toEqual({ "cases.view": "all", "dashboard.view": true });
    expect(sanitizeEffectivePermissions(null)).toEqual({});
  });
});
