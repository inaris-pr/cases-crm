import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNTING_SECTIONS,
  SETTINGS_SECTIONS,
  accountControls,
  canOnOwner,
  canOpenRoute,
  caseControls,
  clientControls,
  createActions,
  leadControls,
  resolvePermissions,
  visibleNavItems,
  visiblePersonalSections,
  visibleRecordsTabs,
  visibleSections,
  type AccessContext,
  type RoleKey,
} from "../src/access";

/**
 * RBAC Phase 5 — the pure rules the web app renders from (lib/access
 * controls + navigation). The API uses the same scope evaluator
 * (canOnOwner), so a control is shown exactly when the API would accept it.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));

// Demo ids: Iris 1, Devon 2, Sara 3, Nadia 4, Leo 5, Grace 6, Omar 7, Rachel 8, Tessa 9.
const TEAMS: Record<number, number[]> = { 4: [2, 3], 6: [5], 8: [7] };
function ctx(role: RoleKey, userId: number): AccessContext {
  return { userId, permissions: resolvePermissions([role]), supervisedUserIds: TEAMS[userId] ?? [] };
}
const IRIS = ctx("system_owner", 1);
const DEVON = ctx("csr", 2);
const NADIA = ctx("csr_supervisor", 4);
const LEO = ctx("business_advisor", 5);
const GRACE = ctx("business_advisor_supervisor", 6);
const OMAR = ctx("operations_admin", 7);
const RACHEL = ctx("operations_admin_supervisor", 8);
const TESSA = ctx("hr", 9);
const owned = (ownerUserId: number | null) => ({ ownerUserId });

describe("scope evaluator", () => {
  it("own, team (supervised members only) and all", () => {
    expect(canOnOwner(DEVON, "cases.edit", 2)).toBe(true);
    expect(canOnOwner(DEVON, "cases.edit", 3)).toBe(false);
    expect(canOnOwner(NADIA, "cases.edit", 2)).toBe(true);
    expect(canOnOwner(NADIA, "cases.edit", 4)).toBe(true);
    expect(canOnOwner(NADIA, "cases.edit", 1)).toBe(false);
    expect(canOnOwner(RACHEL, "cases.edit", 1)).toBe(true); // all
    expect(canOnOwner(RACHEL, "cases.assign", 1)).toBe(false); // team
    expect(canOnOwner(RACHEL, "cases.assign", 7)).toBe(true);
    expect(canOnOwner(NADIA, "cases.edit", null)).toBe(false);
    expect(canOnOwner(IRIS, "cases.edit", null)).toBe(true);
    // A Set works as well as an array.
    expect(canOnOwner({ ...NADIA, supervisedUserIds: new Set([2, 3]) }, "cases.edit", 3)).toBe(true);
  });
});

describe("case controls", () => {
  it("CSR: works any case, edits and automates only her own, never reassigns", () => {
    expect(caseControls(DEVON, owned(2))).toEqual({ edit: true, work: true, reassign: false, editAutomations: true, manageGlobalAutomations: false });
    expect(caseControls(DEVON, owned(3))).toEqual({ edit: false, work: true, reassign: false, editAutomations: false, manageGlobalAutomations: false });
  });
  it("CSR Supervisor: her team's cases, not others'", () => {
    expect(caseControls(NADIA, owned(3))).toMatchObject({ edit: true, reassign: true, editAutomations: true });
    expect(caseControls(NADIA, owned(1))).toMatchObject({ edit: false, work: true, reassign: false });
  });
  it("Admin Supervisor and System Owner", () => {
    expect(caseControls(RACHEL, owned(2))).toEqual({ edit: true, work: true, reassign: false, editAutomations: true, manageGlobalAutomations: true });
    expect(caseControls(IRIS, owned(2))).toEqual({ edit: true, work: true, reassign: true, editAutomations: true, manageGlobalAutomations: true });
  });
  it("Business Advisor and HR: nothing", () => {
    for (const c of [LEO, TESSA]) {
      expect(Object.values(caseControls(c, owned(c.userId))).some(Boolean)).toBe(false);
    }
  });
});

describe("lead controls", () => {
  it("Business Advisor: own leads, no reassign/delete, conversion without a first Case (B4)", () => {
    expect(leadControls(LEO, owned(5))).toEqual({ edit: true, convert: true, convertWithCase: false, reassign: false, delete: false });
    expect(leadControls(LEO, owned(6))).toEqual({ edit: false, convert: false, convertWithCase: false, reassign: false, delete: false });
  });
  it("BA Supervisor: team leads", () => {
    expect(leadControls(GRACE, owned(5))).toEqual({ edit: true, convert: true, convertWithCase: false, reassign: true, delete: true });
    expect(leadControls(GRACE, owned(1)).edit).toBe(false);
  });
  it("CSR and Admin: none; System Owner: all, including the first Case", () => {
    expect(Object.values(leadControls(DEVON, owned(2))).some(Boolean)).toBe(false);
    expect(Object.values(leadControls(RACHEL, owned(8))).some(Boolean)).toBe(false);
    expect(leadControls(IRIS, owned(5))).toEqual({ edit: true, convert: true, convertWithCase: true, reassign: true, delete: true });
  });
});

describe("account controls", () => {
  const fields = ["website", "brand", "name", "ein", "stripeId", "portalId", "archived", "ownerName", "ownerUserId", "id"];
  const editable = (c: AccessContext, owner: number) => fields.filter((f) => accountControls(c, owned(owner)).canEditField(f));
  it("editable field groups per role (R2.3), owner never through a field", () => {
    expect(editable(DEVON, 1)).toEqual(["website"]);
    expect(editable(LEO, 5)).toEqual(["website", "brand"]);
    expect(editable(LEO, 1)).toEqual([]);
    expect(editable(GRACE, 5)).toEqual(["website", "brand"]);
    expect(editable(OMAR, 1)).toEqual(["website", "name"]);
    expect(editable(RACHEL, 1)).toEqual(["website", "brand", "name", "ein", "archived"]);
    expect(editable(IRIS, 1)).toEqual(["website", "brand", "name", "ein", "stripeId", "portalId", "archived"]);
    expect(editable(TESSA, 1)).toEqual([]);
  });
  it("case sections and actions", () => {
    expect(accountControls(LEO, owned(5))).toMatchObject({ viewCases: false, createCase: false, reassign: false, linkClients: false });
    expect(accountControls(DEVON, owned(1))).toMatchObject({ viewCases: true, createCase: true, reassign: false, linkClients: true });
    expect(accountControls(GRACE, owned(5)).reassign).toBe(true);
    expect(accountControls(RACHEL, owned(1)).reassign).toBe(false);
  });
});

describe("client controls", () => {
  it("per role", () => {
    expect(clientControls(DEVON, owned(1))).toEqual({ edit: true, reassign: false, linkAccounts: true, viewCases: true, createCase: true });
    expect(clientControls(LEO, owned(1))).toEqual({ edit: false, reassign: false, linkAccounts: false, viewCases: false, createCase: false });
    expect(clientControls(LEO, owned(5)).edit).toBe(true);
    expect(clientControls(RACHEL, owned(7)).reassign).toBe(true);
  });
});

describe("create actions", () => {
  it("per role", () => {
    const a = (c: AccessContext) => createActions(c.permissions);
    expect(a(DEVON)).toEqual({ newLead: false, newCase: true, newAccount: false, newClient: true });
    expect(a(LEO)).toEqual({ newLead: true, newCase: false, newAccount: false, newClient: true });
    expect(a(OMAR)).toEqual({ newLead: false, newCase: true, newAccount: true, newClient: true });
    expect(a(TESSA)).toEqual({ newLead: false, newCase: false, newAccount: false, newClient: false });
    expect(a(IRIS)).toEqual({ newLead: true, newCase: true, newAccount: true, newClient: true });
  });
});

describe("sections by role", () => {
  const roles: RoleKey[] = ["csr", "csr_supervisor", "business_advisor", "business_advisor_supervisor", "operations_admin", "operations_admin_supervisor", "hr", "system_owner"];
  const P = (r: RoleKey) => resolvePermissions([r]);

  it("Accounting: statements with accounting.view, Payroll alone for HR", () => {
    const acc = Object.fromEntries(roles.map((r) => [r, visibleSections(ACCOUNTING_SECTIONS, P(r)).map((s) => s.id)]));
    expect(acc).toEqual({
      csr: [], csr_supervisor: [], business_advisor: [], business_advisor_supervisor: [],
      operations_admin: [], operations_admin_supervisor: [], hr: ["payroll"],
      system_owner: ["ledger", "trial", "balance", "pl", "cashflow", "payroll"],
    });
  });

  it("Settings: only permitted live sections; no system sections for supervisors or HR; Invite users (People) hidden", () => {
    const set = Object.fromEntries(roles.map((r) => [r, visibleSections(SETTINGS_SECTIONS, P(r)).map((s) => s.id)]));
    expect(set).toEqual({
      csr: [], csr_supervisor: ["teams"], business_advisor: [], business_advisor_supervisor: ["teams"],
      operations_admin: [], operations_admin_supervisor: ["teams", "pipelines"], hr: ["teams"],
      system_owner: ["teams", "pipelines", "company", "data"],
    });
    for (const r of roles.filter((x) => x !== "system_owner")) expect(set[r]).not.toContain("data");
    for (const r of roles) expect(set[r]).not.toContain("people");
  });

  it("personal settings: API Keys only for the System Owner", () => {
    for (const r of roles) {
      const ids = visiblePersonalSections(P(r)).map((s) => s.id);
      expect(ids.slice(0, 3)).toEqual(["profile", "notifications", "security"]);
      expect(ids.includes("api_keys")).toBe(r === "system_owner");
    }
  });

  it("route guard: /account is open to every signed-in employee; the rest follow ROUTE_ACCESS", () => {
    expect(canOpenRoute(P("hr"), "/account")).toBe(true);
    expect(canOpenRoute(P("hr"), "/records/accounts")).toBe(false);
    expect(canOpenRoute(P("csr"), "/leads")).toBe(false);
    expect(canOpenRoute(P("business_advisor"), "/records/cases")).toBe(false);
    expect(canOpenRoute(P("business_advisor"), "/records/clients")).toBe(true);
    expect(canOpenRoute(P("hr"), "/accounting")).toBe(true);
    expect(canOpenRoute(P("operations_admin"), "/accounting")).toBe(false);
    expect(canOpenRoute(P("hr"), "/settings")).toBe(true);
    expect(canOpenRoute(P("csr"), "/settings")).toBe(false);
  });

  it("reserved roles have no navigation at all (→ the no-access screen)", () => {
    for (const r of ["filing", "filing_supervisor", "partner"] as RoleKey[]) {
      expect(visibleNavItems(P(r))).toEqual([]);
      expect(visibleRecordsTabs(P(r))).toEqual([]);
    }
  });
});

describe("the web app renders from these rules", () => {
  const src = (f: string) => fs.readFileSync(path.join(HERE, "../../cases/src", f), "utf-8");

  it("App guards every route before the page mounts", () => {
    const app = src("App.tsx");
    expect(app).toMatch(/if \(!canOpenRoute\(permissions, location\)\) return <NoAccess \/>;/);
    expect(app).toMatch(/visibleNavItems\(permissions\)\.length === 0\) return <NoRoleAccess \/>/);
    expect(app).toMatch(/visibleRecordsTabs\(permissions\)/);
  });

  it("Sidebar, Records, Accounting and Settings are built from lib/access", () => {
    expect(src("components/layout/Sidebar.tsx")).toMatch(/visibleNavItems\(permissions/);
    expect(src("pages/Records.tsx")).toMatch(/visibleRecordsTabs\(permissions\)/);
    expect(src("pages/Accounting.tsx")).toMatch(/visibleSections\(ACCOUNTING_SECTIONS, permissions\)/);
    expect(src("pages/Settings.tsx")).toMatch(/visibleSections\(SETTINGS_SECTIONS, permissions\)/);
    expect(src("pages/AccountSettings.tsx")).toMatch(/visiblePersonalSections\(permissions\)/);
  });

  it("no page changes an owner by display name; reassignment uses ownerUserId", () => {
    const dir = path.join(HERE, "../../cases/src");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (/\.tsx?$/.test(e.name)) files.push(path.join(d, e.name));
      }
    };
    walk(dir);
    const offenders = files.filter((f) => /save\("ownerName"\)|stringify\(\{[^)]*\bownerName\b/.test(fs.readFileSync(f, "utf-8")));
    expect(offenders.map((f) => path.relative(dir, f))).toEqual([]);
    expect(src("components/ReassignControl.tsx")).toMatch(/JSON\.stringify\(\{ ownerUserId: id \}\)/);
    expect(src("components/ReassignControl.tsx")).toMatch(/\/api\/owners\/\$\{type\}\/candidates/);
  });
});
