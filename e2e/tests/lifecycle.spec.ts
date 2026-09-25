import { test, expect, type Page } from "@playwright/test";
import { EMAIL, login, logout, testIds } from "./helpers";

/**
 * Phase 7 — case categories, lifecycle and escalations in the browser.
 * Each test creates its own Cases through the API as the signed-in employee
 * (the page's session cookie is shared with page.request).
 */

const SARA = "sara@example.com";

async function createCase(page: Page, title: string, extra: Record<string, unknown> = {}) {
  const res = await page.request.post("/api/cases", { data: { title, accountId: 1, ...extra } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number; caseNumber: string };
}

async function escalateViaUi(page: Page, reasonLabel: string, note: string) {
  await page.getByTestId("escalate-open").click();
  await page.getByTestId("escalate-reason").selectOption({ label: reasonLabel });
  await page.getByTestId("escalate-note").fill(note);
  await page.getByTestId("escalate-confirm").click();
  await expect(page.getByTestId("escalation-banner")).toBeVisible();
}

test.describe("category", () => {
  test("System Owner sets a category on Case Detail; it survives a reload and filters Records → Cases", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    const c = await createCase(page, `P7 category ${Date.now()}`);
    const other = await createCase(page, `P7 uncategorized ${Date.now()}`);
    await page.goto(`/cases/${c.id}`);
    await page.getByTestId("case-category-select").selectOption("registered_agent");
    await expect(page.getByTestId("case-category-chip")).toContainText("Registered Agent");
    await page.reload();
    await expect(page.getByTestId("case-category-select")).toHaveValue("registered_agent");

    await page.goto("/records/cases");
    await expect(page.locator(`[data-testid="case-row"][data-case-number="${other.caseNumber}"]`)).toBeVisible();
    await page.getByTestId("case-filters").click();
    await page.getByTestId("filter-category").selectOption("registered_agent");
    await expect(page.locator(`[data-testid="case-row"][data-case-number="${c.caseNumber}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="case-row"][data-case-number="${other.caseNumber}"]`)).toHaveCount(0);
  });

  test("New Case form offers the category", async ({ page }) => {
    await login(page, EMAIL.csr);
    await page.goto("/records/cases");
    await page.getByRole("button", { name: /New case/i }).first().click();
    await expect(page.getByTestId("new-case-category")).toBeVisible();
    await expect(page.getByTestId("new-case-category").locator("option")).toHaveCount(11); // Uncategorized + 10
  });
});

test.describe("Board New Case", () => {
  test("Records → Cases → Board creates a Case with a Category that persists", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    await page.goto("/records/cases");
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await page.getByTestId("board-new-case").click();
    const title = `P7 board ${Date.now()}`;
    await page.getByTestId("board-new-case-title").fill(title);
    await expect(page.getByTestId("board-new-case-category").locator("option")).toHaveCount(11); // Uncategorized + 10
    await page.getByTestId("board-new-case-category").selectOption({ label: "EIN / Tax" });
    await page.getByTestId("board-new-case-save").click();
    await expect(page.getByTestId("board-new-case-title")).toHaveCount(0); // popup closed
    // The board refreshes and shows the new Case with its category.
    await expect(page.getByText(title)).toBeVisible();

    const found = await (await page.request.get(`/api/cases?search=${encodeURIComponent(title)}`)).json();
    expect(found).toHaveLength(1);
    expect(found[0].category).toBe("ein_tax");
    await page.goto(`/cases/${found[0].id}`);
    await page.reload();
    await expect(page.getByTestId("case-category-select")).toHaveValue("ein_tax");
    await expect(page.getByTestId("case-category-chip")).toContainText("EIN / Tax");
  });
});

test.describe("escalations", () => {
  test("a CSR escalates a colleague's Case but cannot resolve it; her supervisor resolves it; history remains", async ({ page }) => {
    await login(page, SARA);
    const c = await createCase(page, `P7 escalation ${Date.now()}`, { priority: "low" });
    await logout(page);

    await login(page, EMAIL.csr); // Devon: cases.work on all, cases.edit on his own only
    await page.goto(`/cases/${c.id}`);
    await escalateViaUi(page, "Customer Dispute", "Customer disputes the filing outcome");
    await expect(page.getByTestId("escalation-reason")).toHaveText("Customer Dispute");
    await expect(page.getByTestId("escalation-note")).toHaveText("Customer disputes the filing outcome");
    await expect(page.getByTestId("escalation-by")).toContainText("Devon Park");
    await expect(page.getByTestId("escalation-resolve")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("escalation-banner")).toBeVisible();
    await expect(page.getByTestId("escalation-resolve")).toHaveCount(0);
    await logout(page);

    await login(page, EMAIL.csrSupervisor); // Nadia supervises Sara
    await page.goto(`/cases/${c.id}`);
    await page.getByTestId("escalation-resolve").click();
    await expect(page.getByTestId("escalation-banner")).toHaveCount(0);
    await expect(page.getByTestId("escalate-open")).toBeVisible();
    await page.getByTestId("case-history-toggle").click();
    await expect(page.getByTestId("escalation-history-resolved")).toContainText("Customer Dispute");
    await expect(page.getByTestId("escalation-history-resolved")).toContainText("Resolved by Nadia Flores");
  });

  test("closing and reopening are recorded in the lifecycle history", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    const c = await createCase(page, `P7 lifecycle ${Date.now()}`);
    await page.request.patch(`/api/cases/${c.id}`, { data: { status: "completed" } });
    await page.request.patch(`/api/cases/${c.id}`, { data: { status: "in_progress" } });
    await page.request.patch(`/api/cases/${c.id}`, { data: { status: "completed" } });
    await page.goto(`/cases/${c.id}`);
    await expect(page.getByTestId("case-closed-at")).toContainText("Iris Burgos");
    await expect(page.getByTestId("case-resolution")).toContainText("Latest cycle");
    await page.getByTestId("case-history-toggle").click();
    await expect(page.getByTestId("status-event-closed")).toHaveCount(2);
    await expect(page.getByTestId("status-event-reopened")).toHaveCount(1);
  });

  test("a Case closed before Phase 7 says its closed date is unavailable and shows no resolution time", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    const all = await (await page.request.get("/api/cases?status=completed")).json();
    const legacy = all.find((c: { closedAt: string | null }) => c.closedAt === null);
    expect(legacy, "the seeded completed Case has no recorded closing time").toBeTruthy();
    await page.goto(`/cases/${legacy.id}`);
    await expect(page.getByTestId("case-closed-at")).toContainText("Closed date unavailable");
    await expect(page.getByTestId("case-resolution")).toHaveCount(0);
  });
});

test.describe("dashboards and access", () => {
  test("supervisor sees her team's escalation; another team's admin does not; no leak after switching", async ({ page }) => {
    await login(page, EMAIL.csr);
    const c = await createCase(page, `P7 dashboard ${Date.now()}`);
    const esc = await page.request.post(`/api/cases/${c.id}/escalations`, { data: { reason: "deadline_risk" } });
    expect(esc.status()).toBe(201);
    await logout(page);

    await login(page, EMAIL.csrSupervisor);
    await expect(page.getByTestId("widget-case-escalations")).toContainText(c.caseNumber);
    await logout(page);

    await login(page, EMAIL.admin); // Omar: own scope, not his Case
    await expect(page.getByTestId("widget-case-escalations")).toBeVisible();
    await expect(page.locator('[data-testid="widget-case-escalations"][data-state="ready"]')).toBeVisible();
    await expect(page.getByTestId("widget-case-escalations")).not.toContainText(c.caseNumber);
    await logout(page);

    // Record every widget inserted from here on, then sign in as HR.
    await page.evaluate(() => {
      const seen = new Set<string>();
      (window as any).__seen = seen;
      new MutationObserver((records) => {
        for (const r of records)
          r.addedNodes.forEach((n) => {
            if (!(n instanceof Element)) return;
            const add = (el: Element) => {
              const id = el.getAttribute("data-testid");
              if (id) seen.add(id);
            };
            add(n);
            n.querySelectorAll("[data-testid]").forEach(add);
          });
      }).observe(document.body, { childList: true, subtree: true });
    });
    await login(page, EMAIL.hr);
    await expect(page.locator('[data-testid^="widget-"][data-state="ready"]').first()).toBeVisible();
    const seen: string[] = await page.evaluate(() => [...(window as any).__seen]);
    expect(seen.filter((id) => /escalat|case-/.test(id))).toEqual([]);
    await expect(page.getByText(c.caseNumber)).toHaveCount(0);
  });

  test("Business Advisor and HR get no Case or escalation UI, even by URL", async ({ page }) => {
    for (const role of ["businessAdvisor", "hr"] as const) {
      await login(page, EMAIL[role]);
      await expect(page.getByTestId("widget-case-escalations")).toHaveCount(0);
      await page.goto("/cases/1");
      await expect(page.getByTestId("no-access")).toBeVisible();
      await expect(page.getByTestId("escalate-open")).toHaveCount(0);
      await expect(page.getByTestId("escalation-banner")).toHaveCount(0);
      await page.goto("/");
      await logout(page);
    }
  });
});

test.describe("Records → Cases sorting is unchanged", () => {
  test("Case # sorts ascending, then descending, then back to Last Modified", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    await page.goto("/records/cases");
    const numbers = async () => {
      await expect(page.getByTestId("case-row").first()).toBeVisible();
      const ids = await page.getByTestId("case-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-case-number")!));
      return ids.map((n) => Number(n.replace(/\D/g, "")));
    };
    const defaultOrder = await numbers();
    await page.getByTestId("sort-caseNumber").click();
    const asc = await numbers();
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    await page.getByTestId("sort-caseNumber").click();
    const desc = await numbers();
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    await page.getByTestId("sort-caseNumber").click();
    expect(await numbers()).toEqual(defaultOrder);
    expect(await testIds(page, "sort-")).toEqual(["caseNumber", "createdAt"]);
  });
});
