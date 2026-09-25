import { test, expect, type Request } from "@playwright/test";
import { EMAIL, login, logout, sidebar, testIds } from "./helpers";

/**
 * RBAC Phase 5 — the web app shows each employee only what their role
 * permits (lib/access), refuses forbidden URLs before fetching anything, and
 * never carries one employee's navigation into the next session.
 * The API enforces the same rules (covered by the API test suite).
 */

// Knowledge (Phase 8B) is an in-app page for every role holding knowledge.view.
const SIDEBAR: [keyof typeof EMAIL, string[]][] = [
  ["csr", ["dashboard", "records", "messages", "knowledge"]],
  ["csrSupervisor", ["dashboard", "records", "insights", "messages", "knowledge", "settings"]],
  ["businessAdvisor", ["dashboard", "leads", "records", "messages", "knowledge"]],
  ["baSupervisor", ["dashboard", "leads", "records", "messages", "knowledge", "settings"]],
  ["admin", ["dashboard", "records", "messages", "knowledge"]],
  ["adminSupervisor", ["dashboard", "records", "insights", "messages", "knowledge", "settings"]],
  ["hr", ["dashboard", "messages", "knowledge", "accounting", "settings"]],
  ["systemOwner", ["dashboard", "leads", "records", "insights", "messages", "knowledge", "accounting", "settings"]],
];

test.describe("sidebar by role", () => {
  for (const [role, items] of SIDEBAR) {
    test(`${role}: ${items.join(", ")}`, async ({ page }) => {
      await login(page, EMAIL[role]);
      expect(await sidebar(page)).toEqual(items);
    });
  }
});

test.describe("Records tabs", () => {
  test("Business Advisor sees Accounts and Clients, never Cases", async ({ page }) => {
    await login(page, EMAIL.businessAdvisor);
    await page.getByTestId("nav-records").click();
    await expect(page).toHaveURL(/\/records\/accounts$/);
    expect(await testIds(page, "records-tab-")).toEqual(["accounts", "clients"]);
  });

  test("CSR sees all three tabs", async ({ page }) => {
    await login(page, EMAIL.csr);
    await page.getByTestId("nav-records").click();
    expect(await testIds(page, "records-tab-")).toEqual(["accounts", "clients", "cases"]);
  });

  test("Business Advisor opening the Cases tab URL gets No Access, without fetching cases", async ({ page }) => {
    await login(page, EMAIL.businessAdvisor);
    const casesCalls: string[] = [];
    page.on("request", (r: Request) => {
      if (new URL(r.url()).pathname.startsWith("/api/cases")) casesCalls.push(r.url());
    });
    await page.goto("/records/cases");
    await expect(page.getByTestId("no-access")).toBeVisible();
    await expect(page.getByTestId("records-tab-cases")).toHaveCount(0);
    expect(casesCalls).toEqual([]);
  });
});

test.describe("protected direct URLs", () => {
  test("CSR typing /leads sees No Access and the app never requests lead data", async ({ page }) => {
    await login(page, EMAIL.csr);
    const leadCalls: string[] = [];
    page.on("request", (r: Request) => {
      if (new URL(r.url()).pathname.startsWith("/api/leads")) leadCalls.push(r.url());
    });
    await page.goto("/leads");
    await expect(page.getByTestId("no-access")).toBeVisible();
    await page.waitForTimeout(500);
    expect(leadCalls).toEqual([]);
  });

  test("HR has no Leads and no Records, even by URL", async ({ page }) => {
    await login(page, EMAIL.hr);
    const nav = await sidebar(page);
    expect(nav).not.toContain("leads");
    expect(nav).not.toContain("records");
    for (const url of ["/leads", "/records", "/records/accounts", "/accounts/1", "/cases/1"]) {
      await page.goto(url);
      await expect(page.getByTestId("no-access"), url).toBeVisible();
    }
  });

  test("Operations Admin has no Leads", async ({ page }) => {
    await login(page, EMAIL.admin);
    expect(await sidebar(page)).not.toContain("leads");
    await page.goto("/leads");
    await expect(page.getByTestId("no-access")).toBeVisible();
  });
});

test.describe("Accounting and Settings", () => {
  test("HR sees only Payroll in Accounting", async ({ page }) => {
    await login(page, EMAIL.hr);
    await page.getByTestId("nav-accounting").click();
    expect(await testIds(page, "accounting-tab-")).toEqual(["payroll"]);
    await expect(page.getByTestId("accounting-prototype-note")).toBeVisible();
  });

  test("System Owner sees every Accounting tab; a CSR is refused", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    await page.getByTestId("nav-accounting").click();
    expect(await testIds(page, "accounting-tab-")).toEqual(["ledger", "trial", "balance", "pl", "cashflow", "payroll"]);
    await logout(page);
    await login(page, EMAIL.csr);
    await page.goto("/accounting");
    await expect(page.getByTestId("no-access")).toBeVisible();
  });

  test("Settings sections per role; no Invite users, no Danger zone below System Owner", async ({ page }) => {
    await login(page, EMAIL.hr);
    await page.getByTestId("nav-settings").click();
    expect(await testIds(page, "settings-tab-")).toEqual(["divisions"]);
    await expect(page.getByTestId("settings-danger-zone")).toHaveCount(0);
    await logout(page);

    await login(page, EMAIL.adminSupervisor);
    await page.getByTestId("nav-settings").click();
    expect(await testIds(page, "settings-tab-")).toEqual(["divisions", "pipelines"]);
    await expect(page.getByTestId("settings-danger-zone")).toHaveCount(0);
    await logout(page);

    await login(page, EMAIL.systemOwner);
    await page.getByTestId("nav-settings").click();
    expect(await testIds(page, "settings-tab-")).toEqual(["divisions", "pipelines", "company"]);
    await expect(page.getByTestId("settings-danger-zone")).toBeVisible();
  });

  test("API Keys appears in personal settings for the System Owner only", async ({ page }) => {
    await login(page, EMAIL.csrSupervisor);
    await page.getByTestId("nav-account").click();
    expect(await testIds(page, "personal-")).toEqual(["profile", "notifications", "security"]);
    await logout(page);
    await login(page, EMAIL.systemOwner);
    await page.getByTestId("nav-account").click();
    expect(await testIds(page, "personal-")).toEqual(["profile", "notifications", "security", "api_keys"]);
  });
});

test.describe("switching employees", () => {
  test("logout as System Owner on /leads, login as CSR: Dashboard, and Leads never appears", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    await page.getByTestId("nav-leads").click();
    await expect(page).toHaveURL(/\/leads$/);
    await logout(page);

    // Record every sidebar entry that is ever inserted from here on.
    await page.evaluate(() => {
      const seen = new Set<string>();
      (window as any).__seenNav = seen;
      const scan = (root: ParentNode) =>
        root.querySelectorAll?.('[data-testid^="nav-"]').forEach((el) => seen.add(el.getAttribute("data-testid")!));
      new MutationObserver((records) => {
        for (const r of records) r.addedNodes.forEach((n) => n instanceof Element && (scan(n), n.matches('[data-testid^="nav-"]') && seen.add(n.getAttribute("data-testid")!)));
      }).observe(document.body, { childList: true, subtree: true });
    });

    await login(page, EMAIL.csr);
    await expect(page).toHaveURL(/\/$/);
    const seen: string[] = await page.evaluate(() => [...(window as any).__seenNav]);
    expect(seen).toContain("nav-dashboard"); // the observer did see the new sidebar
    expect(seen).not.toContain("nav-leads");
    expect(seen).not.toContain("nav-accounting");
    expect(await sidebar(page)).toEqual(["dashboard", "records", "messages", "knowledge"]);
  });

  test("every successful login lands on the Dashboard, whatever was open before", async ({ page }) => {
    await login(page, EMAIL.csrSupervisor);
    await page.getByTestId("nav-settings").click();
    await expect(page).toHaveURL(/\/settings$/);
    await logout(page);
    await login(page, EMAIL.csrSupervisor);
    await expect(page).toHaveURL(/\/$/);
    await logout(page);
    await login(page, EMAIL.hr);
    await expect(page).toHaveURL(/\/$/);
  });

  test("refreshing an authorized page stays on it", async ({ page }) => {
    await login(page, EMAIL.businessAdvisor);
    await page.goto("/records/clients");
    await expect(page.getByTestId("records-tab-clients")).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/records\/clients$/);
    await expect(page.getByTestId("records-tab-clients")).toBeVisible();
    expect(await testIds(page, "records-tab-")).toEqual(["accounts", "clients"]);
  });
});

test.describe("System Owner", () => {
  test("sees every authorized live section and can open each", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    for (const id of ["leads", "records", "insights", "messages", "knowledge", "accounting", "settings"]) {
      await page.getByTestId(`nav-${id}`).click();
      await expect(page.getByTestId("no-access")).toHaveCount(0);
    }
    await page.getByTestId("nav-records").click();
    expect(await testIds(page, "records-tab-")).toEqual(["accounts", "clients", "cases"]);
  });
});

test.describe("inside record pages", () => {
  test("Business Advisor's Account page shows no case counts, Cases tab or New Case", async ({ page }) => {
    await login(page, EMAIL.businessAdvisor);
    await page.goto("/accounts/1");
    await expect(page.getByText("Account Owner")).toBeVisible();
    await expect(page.getByRole("button", { name: /New Case/i })).toHaveCount(0);
    await expect(page.getByText(/^Cases \(/)).toHaveCount(0);
    await expect(page.getByText("Total cases")).toHaveCount(0);
    // Sensitive fields are shown as restricted, never as their values.
    await expect(page.getByTestId("restricted-field").first()).toBeVisible();
  });

  test("CSR Supervisor can reassign a team member's case; a CSR cannot see Reassign", async ({ page }) => {
    await login(page, EMAIL.csr);
    // One of Devon's own cases (the page's session cookie is shared).
    const mine = await (await page.request.get("/api/cases?assignee=Devon%20Park")).json();
    const url = `/cases/${mine[0].id}`;
    await page.goto(url);
    await expect(page.getByTestId("owner-field")).toContainText("Devon Park");
    await expect(page.getByTestId("reassign-open")).toHaveCount(0);
    await logout(page);

    await login(page, EMAIL.csrSupervisor);
    await page.goto(url);
    await page.getByTestId("reassign-open").click();
    const options = await page.getByTestId("reassign-select").locator("option").allTextContents();
    // Only her team (plus herself) — never another department.
    expect(options.slice(1).sort()).toEqual(["Nadia Flores", "Sara Mitchell"]);
    await page.getByTestId("reassign-select").selectOption({ label: "Sara Mitchell" });
    await page.getByTestId("reassign-confirm").click();
    await expect(page.getByTestId("owner-field")).toContainText("Sara Mitchell");
  });
});
