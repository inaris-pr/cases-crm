import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NAV_ITEMS,
  PERMISSION_KEYS,
  RECORDS_TAB_SECTIONS,
  RESERVED_ROLE_KEYS,
  ROUTE_ACCESS,
  canOpenRoute,
  resolvePermissions,
  routeAccessFor,
  visibleNavItems,
  visibleRecordsTabs,
  visibleSections,
  SETTINGS_SECTIONS,
  INSIGHTS_SECTIONS,
  ACCOUNTING_SECTIONS,
  type RoleKey,
} from "../src/access";

/** Navigation metadata (§R6). Defined in Phase 2, used by the web app in Phase 5. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const as = (...roles: RoleKey[]) => resolvePermissions(roles);
const nav = (role: RoleKey) => visibleNavItems(as(role)).map((i) => i.id);

describe("sidebar per role", () => {
  const EXPECTED: [RoleKey, string[]][] = [
    ["csr", ["dashboard", "records", "messages", "knowledge"]],
    ["csr_supervisor", ["dashboard", "records", "insights", "messages", "knowledge", "settings"]],
    ["business_advisor", ["dashboard", "leads", "records", "messages", "knowledge"]],
    // Sales insights are planned, so Insights stays hidden until they ship (D20).
    ["business_advisor_supervisor", ["dashboard", "leads", "records", "messages", "knowledge", "settings"]],
    ["operations_admin", ["dashboard", "records", "messages", "knowledge"]],
    ["operations_admin_supervisor", ["dashboard", "records", "insights", "messages", "knowledge", "settings"]],
    // People insights are planned; Payroll is live.
    ["hr", ["dashboard", "messages", "knowledge", "accounting", "settings"]],
    ["system_owner", ["dashboard", "leads", "records", "insights", "messages", "knowledge", "accounting", "settings"]],
  ];
  for (const [role, items] of EXPECTED) {
    it(`${role}`, () => expect(nav(role)).toEqual(items));
  }

  it("reserved roles see nothing", () => {
    for (const role of RESERVED_ROLE_KEYS) expect(nav(role)).toEqual([]);
    expect(visibleNavItems({})).toEqual([]);
  });

  it("Knowledge is the in-app Knowledge Base, for knowledge.view holders only (Phase 8B)", () => {
    const kb = visibleNavItems(as("csr")).find((i) => i.id === "knowledge");
    expect(kb).toMatchObject({ label: "Knowledge", href: "/knowledge" });
    expect(kb?.external).toBeUndefined();
    const withoutKb = { ...as("csr") };
    delete withoutKb["knowledge.view"];
    expect(visibleNavItems(withoutKb).map((i) => i.id)).not.toContain("knowledge");
    for (const path of ["/knowledge", "/knowledge/california-llc-services-and-requirements", "/knowledge?q=banking"]) {
      expect(canOpenRoute(as("csr"), path)).toBe(true);
      expect(canOpenRoute(as("hr"), path)).toBe(true);
      expect(canOpenRoute(withoutKb, path)).toBe(false);
      for (const role of RESERVED_ROLE_KEYS) expect(canOpenRoute(as(role), path)).toBe(false);
    }
  });

  it("points Records at the first tab the user may open", () => {
    expect(visibleNavItems(as("csr")).find((i) => i.id === "records")?.href).toBe("/records/accounts");
  });

  it("keeps the approved sidebar order", () => {
    expect(NAV_ITEMS.map((i) => i.id)).toEqual(
      ["dashboard", "leads", "records", "insights", "messages", "knowledge", "accounting", "settings"],
    );
  });
});

describe("sections per role", () => {
  it("Records tabs", () => {
    expect(visibleRecordsTabs(as("csr"))).toEqual(["accounts", "clients", "cases"]);
    expect(visibleRecordsTabs(as("business_advisor"))).toEqual(["accounts", "clients"]);
    expect(visibleRecordsTabs(as("operations_admin"))).toEqual(["accounts", "clients", "cases"]);
    expect(visibleRecordsTabs(as("hr"))).toEqual([]);
  });

  it("Settings sections (live only; planned ones with includePlanned)", () => {
    const ids = (role: RoleKey, includePlanned = false) =>
      visibleSections(SETTINGS_SECTIONS, as(role), { includePlanned }).map((s) => s.id);
    expect(ids("csr")).toEqual([]);
    expect(ids("csr_supervisor")).toEqual(["teams"]);
    expect(ids("csr_supervisor", true)).toEqual(["teams", "team_config", "people"]);
    expect(ids("business_advisor_supervisor")).toEqual(["teams"]);
    expect(ids("operations_admin_supervisor")).toEqual(["teams", "pipelines"]);
    expect(ids("operations_admin_supervisor", true)).toEqual(["teams", "team_config", "pipelines", "case_config", "people"]);
    expect(ids("hr")).toEqual(["teams"]);
    expect(ids("hr", true)).toEqual(["teams", "people"]);
    expect(ids("system_owner")).toEqual(["teams", "pipelines", "company", "data"]);
    expect(ids("system_owner", true)).toEqual(SETTINGS_SECTIONS.map((s) => s.id));
  });

  it("Insights and Accounting sections", () => {
    const ins = (role: RoleKey, includePlanned = false) =>
      visibleSections(INSIGHTS_SECTIONS, as(role), { includePlanned }).map((s) => s.id);
    expect(ins("csr_supervisor")).toEqual(["cases"]);
    expect(ins("business_advisor_supervisor", true)).toEqual(["sales"]);
    expect(ins("hr", true)).toEqual(["people"]);
    expect(ins("csr")).toEqual([]);
    const acc = (role: RoleKey) => visibleSections(ACCOUNTING_SECTIONS, as(role)).map((s) => s.id);
    expect(acc("hr")).toEqual(["payroll"]);
    expect(acc("system_owner")).toEqual(["ledger", "trial", "balance", "pl", "cashflow", "payroll"]);
    expect(acc("operations_admin_supervisor")).toEqual([]);
  });

  it("only reference catalog permissions", () => {
    const all = [...NAV_ITEMS.flatMap((i) => [...(i.requires ?? []), ...(i.sections ?? []).flatMap((s) => s.requires)]),
      ...ROUTE_ACCESS.flatMap((r) => r.requires)];
    for (const p of all) expect(PERMISSION_KEYS).toContain(p);
  });
});

describe("route metadata", () => {
  function appRoutes(): string[] {
    const src = fs.readFileSync(path.join(HERE, "../../cases/src/App.tsx"), "utf-8");
    return [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
  }
  function legacyListRoutes(): string[] {
    const src = fs.readFileSync(path.join(HERE, "../../cases/src/lib/records.ts"), "utf-8");
    const block = src.match(/LEGACY_LIST_ROUTES[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
    if (!block) throw new Error("LEGACY_LIST_ROUTES not found");
    return [...block[1].matchAll(/\[\s*"([^"]+)"/g)].map((m) => m[1]);
  }

  it("covers every route the web app declares", () => {
    const routes = appRoutes();
    expect(routes).toContain("/leads");
    const legacy = legacyListRoutes();
    expect(legacy.length).toBeGreaterThan(0);
    const concrete = [
      ...routes.flatMap((r) =>
        r === "/records/:tab" ? RECORDS_TAB_SECTIONS.map((s) => s.href!) : [r.replace(/:([a-z]+)/g, "1")],
      ),
      ...legacy,
    ];
    const missing = concrete.filter((p) => routeAccessFor(p) === null);
    expect(missing).toEqual([]);
    for (const p of legacy) expect(routeAccessFor(p)?.redirect).toBe(true);
  });

  it("guards /leads with leads.view — CSR and Admin may not open it", () => {
    expect(routeAccessFor("/leads")?.requires).toEqual(["leads.view"]);
    expect(canOpenRoute(as("csr"), "/leads")).toBe(false);
    expect(canOpenRoute(as("operations_admin_supervisor"), "/leads")).toBe(false);
    expect(canOpenRoute(as("business_advisor"), "/leads")).toBe(true);
  });

  it("guards record pages and tabs", () => {
    expect(canOpenRoute(as("business_advisor"), "/records/cases")).toBe(false);
    expect(canOpenRoute(as("business_advisor"), "/cases/12")).toBe(false);
    expect(canOpenRoute(as("business_advisor"), "/accounts/3")).toBe(true);
    expect(canOpenRoute(as("csr"), "/cases/12?tab=activity")).toBe(true);
    expect(canOpenRoute(as("hr"), "/records/accounts")).toBe(false);
  });

  it("guards Settings, Insights and Accounting by their live sections", () => {
    expect(canOpenRoute(as("csr"), "/settings")).toBe(false);
    expect(canOpenRoute(as("csr_supervisor"), "/settings")).toBe(true);
    expect(canOpenRoute(as("hr"), "/insights")).toBe(false); // People insights not live yet
    expect(canOpenRoute(as("csr_supervisor"), "/insights")).toBe(true);
    expect(canOpenRoute(as("hr"), "/accounting")).toBe(true);
    expect(canOpenRoute(as("operations_admin_supervisor"), "/accounting")).toBe(false);
  });

  it("leaves redirects and unknown paths to their destination", () => {
    expect(canOpenRoute({}, "/cases")).toBe(true);
    expect(canOpenRoute({}, "/no-such-page")).toBe(true);
    expect(canOpenRoute({}, "/")).toBe(false);
  });
});
