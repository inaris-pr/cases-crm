import { describe, it, expect } from "vitest";
import { store } from "../src/store";
import { buildDashboard } from "../src/dashboard";
import {
  DASHBOARD_SECTION_REQUIREMENTS,
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_IDS,
  resolvePermissions,
  visibleDashboardWidgets,
  type RoleKey,
} from "../src/access";
import { supervisedMemberIds, type Principal } from "../src/auth/authorize";
import { DEMO_EMAIL_FOR_ROLE } from "./helpers/roles";

/**
 * RBAC Phase 6 — the widgets each role sees (lib/access DASHBOARD_WIDGETS),
 * and the guarantee that the server returns every section a visible widget
 * reads, so no widget can appear and then fail.
 */
const EXPECTED: Record<string, string[]> = {
  csr: [
    "case-summary", "case-attention", "case-escalations", "case-least-recent", "case-breakdown", "case-recent",
    "case-activity", "case-trend", "calls", "mentions", "conversations",
  ],
  csr_supervisor: [
    "case-summary", "case-attention", "case-escalations", "case-least-recent", "case-workload", "case-breakdown",
    "case-categories", "case-recent", "case-activity", "case-trend", "calls", "mentions", "conversations",
  ],
  business_advisor: ["lead-summary", "lead-pipeline", "lead-recent", "accounts", "mentions", "conversations"],
  business_advisor_supervisor: [
    "lead-summary", "lead-pipeline", "lead-recent", "lead-workload", "accounts", "mentions", "conversations",
  ],
  operations_admin: [
    "case-summary", "case-attention", "case-escalations", "case-least-recent", "case-breakdown", "case-recent",
    "case-activity", "case-trend", "calls", "mentions", "conversations",
  ],
  operations_admin_supervisor: [
    "case-summary", "case-attention", "case-escalations", "case-least-recent", "case-workload", "case-breakdown",
    "case-categories", "case-recent", "case-activity", "case-trend", "calls", "mentions", "conversations",
  ],
  hr: ["people-summary", "people-distribution", "people-teams", "mentions", "conversations"],
  system_owner: [...DASHBOARD_WIDGET_IDS],
  filing: [],
  filing_supervisor: [],
  partner: [],
};

const principalFor = (role: RoleKey): Principal => {
  const email = DEMO_EMAIL_FOR_ROLE[role];
  const user = (email && store.users.find((u) => u.email === email)) || store.users[0]!;
  return { user, permissions: resolvePermissions([role]), supervisedUserIds: supervisedMemberIds(user.id) };
};

describe("dashboard widgets by role", () => {
  for (const [role, widgets] of Object.entries(EXPECTED)) {
    it(`${role}: exactly the expected widgets`, () => {
      expect(visibleDashboardWidgets(resolvePermissions([role]))).toEqual(widgets);
    });
  }

  it("no lead, sales or account widgets for CSR, Operations Admin or HR; no case widgets for Business Advisors or HR", () => {
    for (const role of ["csr", "csr_supervisor", "operations_admin", "operations_admin_supervisor", "hr"]) {
      const ids = visibleDashboardWidgets(resolvePermissions([role]));
      expect(ids.filter((id) => /^(lead|accounts)/.test(id))).toEqual([]);
    }
    for (const role of ["business_advisor", "business_advisor_supervisor", "hr"]) {
      const ids = visibleDashboardWidgets(resolvePermissions([role]));
      expect(ids.filter((id) => /^(case|calls)/.test(id))).toEqual([]);
    }
  });

  it("several roles: the union of their widgets", () => {
    const both = visibleDashboardWidgets(resolvePermissions(["csr", "business_advisor"]));
    const union = new Set([
      ...visibleDashboardWidgets(resolvePermissions(["csr"])),
      ...visibleDashboardWidgets(resolvePermissions(["business_advisor"])),
    ]);
    expect([...both].sort()).toEqual([...union].sort());
    expect(both.length).toBe(union.size);
  });

  it("every widget requires at least its section's permissions", () => {
    for (const [id, spec] of Object.entries(DASHBOARD_WIDGETS)) {
      for (const req of DASHBOARD_SECTION_REQUIREMENTS[spec.section]) {
        expect({ id, has: spec.requires.some((r) => r.permission === req.permission) }).toEqual({ id, has: true });
      }
    }
  });

  it("the server returns the section of every widget the role sees (and the team tables when shown)", () => {
    for (const role of Object.keys(EXPECTED) as RoleKey[]) {
      const p = principalFor(role);
      const body = buildDashboard(p, store);
      for (const id of visibleDashboardWidgets(p.permissions)) {
        const section = DASHBOARD_WIDGETS[id].section;
        expect({ role, id, present: body[section] !== undefined }).toEqual({ role, id, present: true });
      }
      const ids = visibleDashboardWidgets(p.permissions);
      expect(body.cases?.workload !== undefined).toBe(ids.includes("case-workload"));
      expect(body.leads?.workload !== undefined).toBe(ids.includes("lead-workload"));
      expect(body.cases?.byCategory !== undefined).toBe(ids.includes("case-categories"));
    }
  });

  it("the web app's widget registry covers exactly DASHBOARD_WIDGETS", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "../../cases/src/components/dashboard/widgets.tsx"), "utf-8");
    const ids = [...src.matchAll(/^    id: "([a-z-]+)",$/gm)].map((m) => m[1]);
    expect(ids).toEqual(DASHBOARD_WIDGET_IDS);
  });
});
