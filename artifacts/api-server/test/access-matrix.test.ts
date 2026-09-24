import { describe, it, expect } from "vitest";
import {
  PERMISSION_KEYS,
  RESERVED_ROLE_KEYS,
  resolvePermissions,
  type Permission,
  type RoleKey,
} from "../src/access";

/**
 * The approved permission matrix — architecture plan Revision 1, §R5 with
 * the Account grants of §R2.4, the Settings/people/system grants of §R3 and
 * the Insights permissions of §R4 — asserted cell by cell against the role
 * bundles in lib/access. Changing access means changing this table on
 * purpose, in review.
 *
 * A = all · T = team · O = own · Y = granted (unscoped) · - = not granted
 */
const ROLES: RoleKey[] = [
  "csr",
  "csr_supervisor",
  "business_advisor",
  "business_advisor_supervisor",
  "operations_admin",
  "operations_admin_supervisor",
  "hr",
  "system_owner",
];

type Cell = "A" | "T" | "O" | "Y" | "-";
//                                      CSR  CSR-S BA   BA-S Adm  Adm-S HR   SO
const MATRIX: [Permission, ...Cell[]][] = [
  ["dashboard.view",                    "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
  // Leads
  ["leads.view",                        "-", "-", "O", "T", "-", "-", "-", "A"],
  ["leads.create",                      "-", "-", "Y", "Y", "-", "-", "-", "Y"],
  ["leads.edit",                        "-", "-", "O", "T", "-", "-", "-", "A"],
  ["leads.convert",                     "-", "-", "O", "T", "-", "-", "-", "A"],
  ["leads.assign",                      "-", "-", "-", "T", "-", "-", "-", "A"],
  ["leads.delete",                      "-", "-", "-", "T", "-", "-", "-", "A"],
  // Accounts (§R2.4)
  ["accounts.view",                     "A", "A", "A", "A", "A", "A", "-", "A"],
  ["accounts.view.regulatory_ids",      "-", "-", "-", "-", "Y", "Y", "-", "Y"],
  ["accounts.view.financial",           "-", "-", "-", "-", "-", "-", "-", "Y"],
  ["accounts.create",                   "-", "-", "-", "-", "Y", "Y", "-", "Y"],
  ["accounts.edit.profile",             "A", "A", "O", "T", "A", "A", "-", "A"],
  ["accounts.edit.service",             "-", "-", "O", "T", "-", "A", "-", "A"],
  ["accounts.edit.formation",           "-", "-", "-", "-", "A", "A", "-", "A"],
  ["accounts.edit.regulatory_ids",      "-", "-", "-", "-", "-", "A", "-", "A"],
  ["accounts.edit.financial",           "-", "-", "-", "-", "-", "-", "-", "A"],
  ["accounts.edit.system",              "-", "-", "-", "-", "-", "-", "-", "A"],
  ["accounts.assign",                   "-", "-", "-", "T", "-", "T", "-", "A"],
  ["accounts.archive",                  "-", "-", "-", "-", "-", "A", "-", "A"],
  // Clients
  ["contacts.view",                     "A", "A", "A", "A", "A", "A", "-", "A"],
  ["contacts.create",                   "Y", "Y", "Y", "Y", "Y", "Y", "-", "Y"],
  ["contacts.edit",                     "A", "A", "O", "T", "A", "A", "-", "A"],
  ["contacts.assign",                   "-", "-", "-", "T", "-", "T", "-", "A"],
  ["contacts.link",                     "Y", "Y", "-", "-", "Y", "Y", "-", "Y"],
  // Cases
  ["cases.view",                        "A", "A", "-", "-", "A", "A", "-", "A"],
  ["cases.work",                        "A", "A", "-", "-", "A", "A", "-", "A"],
  ["cases.create",                      "Y", "Y", "-", "-", "Y", "Y", "-", "Y"],
  ["cases.edit",                        "O", "T", "-", "-", "O", "A", "-", "A"],
  ["cases.assign",                      "-", "T", "-", "-", "-", "T", "-", "A"],
  ["automations.edit",                  "O", "T", "-", "-", "O", "A", "-", "A"],
  ["automations.manage_global",         "-", "-", "-", "-", "-", "Y", "-", "Y"],
  // Insights & metrics (§R4)
  ["insights.cases.view",               "-", "T", "-", "-", "-", "A", "-", "A"],
  ["insights.sales.view",               "-", "-", "-", "T", "-", "-", "-", "A"],
  ["insights.people.view",              "-", "-", "-", "-", "-", "-", "A", "A"],
  ["metrics.cases",                     "O", "T", "-", "-", "O", "A", "-", "A"],
  ["metrics.calls",                     "O", "T", "-", "-", "O", "A", "-", "A"],
  ["metrics.sales",                     "-", "-", "O", "T", "-", "-", "-", "A"],
  ["metrics.sales.leaderboard",         "-", "-", "Y", "Y", "-", "-", "-", "Y"],
  ["metrics.people",                    "-", "-", "-", "-", "-", "-", "A", "A"],
  // Communication
  ["messages.use",                      "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
  ["knowledge.view",                    "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
  // Accounting (D8)
  ["accounting.view",                   "-", "-", "-", "-", "-", "-", "-", "Y"],
  ["accounting.payroll.view",           "-", "-", "-", "-", "-", "-", "Y", "Y"],
  // Settings, people, system (§R3)
  ["settings.teams.view",               "-", "T", "-", "T", "-", "A", "A", "A"],
  ["settings.teams.manage",             "-", "T", "-", "-", "-", "T", "-", "A"],
  ["settings.team_config.manage",       "-", "T", "-", "-", "-", "A", "-", "A"],
  ["settings.pipelines.manage",         "-", "-", "-", "-", "-", "Y", "-", "Y"],
  ["settings.case_config.manage",       "-", "-", "-", "-", "-", "Y", "-", "Y"],
  ["settings.company.manage",           "-", "-", "-", "-", "-", "-", "-", "Y"],
  ["people.view",                       "-", "T", "-", "T", "-", "T", "A", "A"],
  ["people.manage",                     "-", "-", "-", "-", "-", "-", "Y", "Y"],
  ["system.security.manage",            "-", "-", "-", "-", "-", "-", "-", "Y"],
  ["system.roles.grant_privileged",     "-", "-", "-", "-", "-", "-", "-", "Y"],
  ["system.integrations.manage",        "-", "-", "-", "-", "-", "-", "-", "Y"],
  ["system.data.manage",                "-", "-", "-", "-", "-", "-", "-", "Y"],
  ["system.audit.view",                 "-", "-", "-", "-", "-", "-", "-", "Y"],
];

const CELL_VALUE: Record<Cell, string | true | undefined> = {
  A: "all",
  T: "team",
  O: "own",
  Y: true,
  "-": undefined,
};

describe("approved permission matrix", () => {
  it("lists every permission in the catalog exactly once", () => {
    const rows = MATRIX.map((r) => r[0]);
    expect(new Set(rows).size).toBe(rows.length);
    expect([...rows].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  for (const [col, role] of ROLES.entries()) {
    it(`${role}: every cell matches`, () => {
      const perms = resolvePermissions([role]);
      const mismatches: string[] = [];
      for (const [permission, ...cells] of MATRIX) {
        const expected = CELL_VALUE[cells[col]];
        const actual = perms[permission];
        if (actual !== expected) mismatches.push(`${permission}: expected ${String(expected)}, got ${String(actual)}`);
      }
      expect(mismatches).toEqual([]);
      // …and nothing outside the table.
      expect(Object.keys(perms).filter((p) => !MATRIX.some((r) => r[0] === p))).toEqual([]);
    });
  }

  it("reserved roles (Filing, Filing Supervisor, Partner) grant nothing at all", () => {
    expect([...RESERVED_ROLE_KEYS].sort()).toEqual(["filing", "filing_supervisor", "partner"]);
    for (const role of RESERVED_ROLE_KEYS) expect(resolvePermissions([role])).toEqual({});
  });

  it("no supervisor, Admin or HR role holds any system.* permission", () => {
    for (const role of ROLES.filter((r) => r !== "system_owner")) {
      const systemPerms = Object.keys(resolvePermissions([role])).filter((p) => p.startsWith("system."));
      expect(systemPerms).toEqual([]);
    }
  });

  it("CSR and Admin roles hold no leads.* permission (the Leads restriction)", () => {
    for (const role of ["csr", "csr_supervisor", "operations_admin", "operations_admin_supervisor", "hr"] as RoleKey[]) {
      expect(Object.keys(resolvePermissions([role])).filter((p) => p.startsWith("leads."))).toEqual([]);
    }
  });

  it("Business Advisors hold no cases.* or automations.* permission (D3)", () => {
    for (const role of ["business_advisor", "business_advisor_supervisor"] as RoleKey[]) {
      const perms = Object.keys(resolvePermissions([role]));
      expect(perms.filter((p) => p.startsWith("cases.") || p.startsWith("automations."))).toEqual([]);
    }
  });

  it("HR holds no customer-record, case or sales permission", () => {
    const perms = Object.keys(resolvePermissions(["hr"]));
    expect(
      perms.filter((p) => /^(accounts|contacts|cases|leads|automations)\./.test(p) || /(cases|sales|calls)/.test(p)),
    ).toEqual([]);
  });
});
