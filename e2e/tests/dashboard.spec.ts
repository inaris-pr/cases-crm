import { test, expect, type Page, type Response } from "@playwright/test";
import { EMAIL, login, logout, testIds } from "./helpers";

/**
 * RBAC Phase 6 — personalized role dashboards.
 *
 * The Dashboard is composed from widgets by the signed-in employee's
 * permissions (lib/access DASHBOARD_WIDGETS). Every figure comes from
 * GET /api/dashboard, computed on the server within the employee's scope.
 */

const CASE_WIDGETS = [
  "case-summary", "case-attention", "case-least-recent", "case-breakdown", "case-recent", "case-activity",
  "case-trend", "calls",
];
const CASE_TEAM_WIDGETS = [
  "case-summary", "case-attention", "case-least-recent", "case-workload", "case-breakdown", "case-recent",
  "case-activity", "case-trend", "calls",
];
const COMMS = ["mentions", "conversations"];

const WIDGETS: [keyof typeof EMAIL, string[]][] = [
  ["csr", [...CASE_WIDGETS, ...COMMS]],
  ["csrSupervisor", [...CASE_TEAM_WIDGETS, ...COMMS]],
  ["businessAdvisor", ["lead-summary", "lead-pipeline", "lead-recent", "accounts", ...COMMS]],
  ["baSupervisor", ["lead-summary", "lead-pipeline", "lead-recent", "lead-workload", "accounts", ...COMMS]],
  ["admin", [...CASE_WIDGETS, ...COMMS]],
  ["adminSupervisor", [...CASE_TEAM_WIDGETS, ...COMMS]],
  ["hr", ["people-summary", "people-distribution", "people-teams", ...COMMS]],
  [
    "systemOwner",
    [
      "case-summary", "lead-summary", "people-summary", "case-attention", "case-least-recent", "case-workload",
      "case-breakdown", "case-recent", "case-activity", "case-trend", "calls", "lead-pipeline", "lead-recent",
      "lead-workload", "accounts", "people-distribution", "people-teams", ...COMMS,
    ],
  ],
];

/** Records every API response the app receives that was refused (401/403). */
function watchRefusals(page: Page): string[] {
  const refused: string[] = [];
  page.on("response", (r: Response) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") && (r.status() === 401 || r.status() === 403) && u.pathname !== "/api/auth/me") {
      refused.push(`${r.status()} ${r.request().method()} ${u.pathname}`);
    }
  });
  return refused;
}

async function widgetsReady(page: Page) {
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.locator('[data-testid^="widget-"][data-state="loading"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="widget-"][data-state="error"]')).toHaveCount(0);
}

test.describe("dashboard widgets by role", () => {
  for (const [role, widgets] of WIDGETS) {
    test(`${role}: lands on the Dashboard with exactly its widgets and no refused requests`, async ({ page }) => {
      const refused = watchRefusals(page);
      await login(page, EMAIL[role]);
      await expect(page).toHaveURL(/\/$/);
      await widgetsReady(page);
      expect(await testIds(page, "widget-")).toEqual(widgets);
      expect(refused).toEqual([]);
    });
  }
});

test.describe("forbidden data never reaches the page", () => {
  test("CSR, Operations Admin and HR: no lead widgets and no lead requests", async ({ page }) => {
    for (const role of ["csr", "admin", "hr"] as const) {
      const leadCalls: string[] = [];
      const onRequest = (r: { url(): string }) => {
        if (new URL(r.url()).pathname.startsWith("/api/leads")) leadCalls.push(r.url());
      };
      page.on("request", onRequest);
      await login(page, EMAIL[role]);
      await widgetsReady(page);
      await expect(page.locator('[data-testid^="widget-lead-"]')).toHaveCount(0);
      await expect(page.getByTestId("widget-accounts")).toHaveCount(0);
      const body = await (await page.request.get("/api/dashboard")).json();
      expect(body.leads).toBeUndefined();
      expect(leadCalls).toEqual([]);
      page.off("request", onRequest);
      await logout(page);
    }
  });

  test("Business Advisor and HR: no case widgets, no case links, no case requests", async ({ page }) => {
    for (const role of ["businessAdvisor", "hr"] as const) {
      const caseCalls: string[] = [];
      const onRequest = (r: { url(): string }) => {
        const p = new URL(r.url()).pathname;
        if (p.startsWith("/api/cases") || p.startsWith("/api/tasks") || p === "/api/stats") caseCalls.push(p);
      };
      page.on("request", onRequest);
      await login(page, EMAIL[role]);
      await widgetsReady(page);
      await expect(page.locator('[data-testid^="widget-case-"]')).toHaveCount(0);
      await expect(page.getByTestId("widget-calls")).toHaveCount(0);
      await expect(page.locator('[data-testid="dashboard"] a[href^="/cases/"]')).toHaveCount(0);
      expect(caseCalls).toEqual([]);
      page.off("request", onRequest);
      await logout(page);
    }
  });
});

test.describe("real, scoped figures", () => {
  test("CSR's headline numbers are the server's own-scope figures", async ({ page }) => {
    await login(page, EMAIL.csr);
    await widgetsReady(page);
    const { cases } = await (await page.request.get("/api/dashboard")).json();
    expect(cases.scope).toBe("own");
    await expect(page.getByTestId("stat-open-cases-value")).toHaveText(String(cases.summary.open));
    await expect(page.getByTestId("stat-overdue-tasks-value")).toHaveText(String(cases.summary.overdueTasks));
    await expect(page.getByTestId("stat-open-tasks-value")).toHaveText(String(cases.summary.openTasks));
  });

  test("CSR Supervisor's workload has one row per team member, by id", async ({ page }) => {
    await login(page, EMAIL.csrSupervisor);
    await widgetsReady(page);
    const me = await (await page.request.get("/api/auth/me")).json();
    const expected = [me.user.id, ...me.supervisedUserIds].map(String).sort();
    expect((await testIds(page, "workload-row-")).sort()).toEqual(expected);
  });

  test("HR sees employee aggregates and team structure only", async ({ page }) => {
    await login(page, EMAIL.hr);
    await widgetsReady(page);
    const { people } = await (await page.request.get("/api/dashboard")).json();
    await expect(page.getByTestId("stat-active-employees-value")).toHaveText(String(people.activeEmployees));
    expect((await testIds(page, "team-")).length).toBe(people.teams.length);
  });
});

test.describe("states", () => {
  test("a failed load shows an error with retry, never zeros; retry recovers", async ({ page }) => {
    let fail = true;
    await page.route("**/api/dashboard", (route) =>
      fail ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }) : route.continue(),
    );
    await login(page, EMAIL.csr);
    await expect(page.getByTestId("dashboard-error")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="widget-"][data-state="error"]').first()).toBeVisible();
    await expect(page.locator('[data-testid$="-value"]')).toHaveCount(0);
    fail = false;
    await page.getByTestId("dashboard-error").getByRole("button", { name: /retry/i }).click();
    await widgetsReady(page);
    await expect(page.getByTestId("dashboard-error")).toHaveCount(0);
    await expect(page.getByTestId("stat-open-cases-value")).toBeVisible();
  });
});

test.describe("switching employees", () => {
  test("System Owner → CSR rebuilds the Dashboard with no stale widgets", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    await widgetsReady(page);
    await expect(page.getByTestId("widget-lead-summary")).toBeVisible();
    await logout(page);

    // Record every widget that is ever inserted from here on.
    await page.evaluate(() => {
      const seen = new Set<string>();
      (window as any).__seenWidgets = seen;
      const add = (el: Element) => {
        const id = el.getAttribute("data-testid");
        if (id?.startsWith("widget-")) seen.add(id);
      };
      new MutationObserver((records) => {
        for (const r of records) {
          r.addedNodes.forEach((n) => {
            if (!(n instanceof Element)) return;
            add(n);
            n.querySelectorAll('[data-testid^="widget-"]').forEach(add);
          });
        }
      }).observe(document.body, { childList: true, subtree: true });
    });

    await login(page, EMAIL.csr);
    await widgetsReady(page);
    const seen: string[] = await page.evaluate(() => [...(window as any).__seenWidgets]);
    expect(seen).toContain("widget-case-summary");
    for (const stale of ["widget-lead-summary", "widget-people-summary", "widget-case-workload", "widget-accounts"]) {
      expect(seen).not.toContain(stale);
    }
    expect(await testIds(page, "widget-")).toEqual(WIDGETS[0][1]);
  });
});
