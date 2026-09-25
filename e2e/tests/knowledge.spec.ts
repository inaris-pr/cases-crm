import { test, expect, type Page, type Request } from "@playwright/test";
import { EMAIL, login, logout, sidebar } from "./helpers";

/**
 * Phase 8B — the Knowledge Base UI over the five LLC pilot articles.
 * Content rules are covered by the API suite; these tests check what an
 * employee sees: access, search, match explanations and the reader's
 * handling of unresolved, disputed and inherited information.
 */

const CA_SLUG = "california-llc-services-and-requirements";
const FL_TEXT =
  "32 LLC add-on services are available — the 30-product baseline plus Convert LLC to Corporation and DBA / Trade Name.";

const results = (page: Page) => page.getByTestId("knowledge-result");
const resultFor = (page: Page, code: string) => page.locator(`[data-testid="knowledge-result"][data-jurisdiction="${code}"]`);
async function jurisdictions(page: Page): Promise<string[]> {
  return results(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-jurisdiction")!));
}
function knowledgeRequests(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (r: Request) => {
    if (new URL(r.url()).pathname.startsWith("/api/knowledge")) calls.push(r.url());
  });
  return calls;
}
/** Answers /api/auth/me as usual but without knowledge.view — an employee who lacks the permission. */
async function withoutKnowledgePermission(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    if (json?.permissions) delete json.permissions["knowledge.view"];
    await route.fulfill({ response: res, json });
  });
}

test.describe("access", () => {
  test("an authorized employee sees Knowledge in the sidebar and opens it", async ({ page }) => {
    await login(page, EMAIL.csr);
    expect(await sidebar(page)).toContain("knowledge");
    await page.getByTestId("nav-knowledge").click();
    await expect(page).toHaveURL(/\/knowledge$/);
    await expect(page.getByRole("heading", { name: "Knowledge Base" })).toBeVisible();
  });

  test("without knowledge.view: no sidebar entry, No Access by URL, and no Knowledge request", async ({ page }) => {
    await withoutKnowledgePermission(page);
    await login(page, EMAIL.csr);
    const calls = knowledgeRequests(page);
    expect(await sidebar(page)).not.toContain("knowledge");
    for (const url of ["/knowledge", `/knowledge/${CA_SLUG}`]) {
      await page.goto(url);
      await expect(page.getByTestId("no-access"), url).toBeVisible();
    }
    await page.waitForTimeout(300);
    expect(calls).toEqual([]);
  });

  test("signed out, a direct article URL shows sign-in and fetches nothing", async ({ page }) => {
    const calls = knowledgeRequests(page);
    await page.goto(`/knowledge/${CA_SLUG}`);
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByTestId("knowledge-article")).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test("switching employees does not carry Knowledge access over", async ({ page }) => {
    await login(page, EMAIL.systemOwner);
    await page.goto(`/knowledge/${CA_SLUG}`);
    await expect(page.getByTestId("knowledge-article")).toBeVisible();
    await logout(page);

    await withoutKnowledgePermission(page);
    const calls = knowledgeRequests(page);
    await login(page, EMAIL.csr);
    await expect(page).toHaveURL(/\/$/);
    expect(await sidebar(page)).not.toContain("knowledge");
    await expect(page.getByTestId("knowledge-article")).toHaveCount(0);
    await page.goto(`/knowledge/${CA_SLUG}`);
    await expect(page.getByTestId("no-access")).toBeVisible();
    expect(calls).toEqual([]);
  });
});

test.describe("discovery and search", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, EMAIL.csr);
    await page.goto("/knowledge");
    await expect(results(page)).toHaveCount(5);
  });

  test("lists exactly the five pilot articles", async ({ page }) => {
    expect(await jurisdictions(page)).toEqual(["AZ", "CA", "DE", "FL", "WY"]);
    await expect(resultFor(page, "CA")).toContainText("California — LLC Services & Requirements");
    // Only entity types that exist are offered.
    await expect(page.getByTestId("knowledge-filter-entity").locator("option")).toHaveText(["All entity types", "LLC"]);
  });

  test("searching California returns California; a miss says so without implying unavailability", async ({ page }) => {
    await page.getByTestId("knowledge-search").fill("California");
    await expect(results(page)).toHaveCount(1);
    expect(await jurisdictions(page)).toEqual(["CA"]);
    await expect(page).toHaveURL(/q=California/);

    await page.getByTestId("knowledge-search").fill("trademark");
    await expect(page.getByTestId("knowledge-empty")).toContainText("No Knowledge Base articles match your search.");
    await expect(page.getByTestId("knowledge-empty")).toContainText("not that a service is unavailable");
  });

  test("banking surfaces Florida through a national shared service, Arizona through its own text", async ({ page }) => {
    await page.getByTestId("knowledge-search").fill("banking");
    await expect(resultFor(page, "FL")).toBeVisible();
    const fl = resultFor(page, "FL");
    await expect(fl.getByTestId("knowledge-match-inherited")).toContainText("Matched through national shared service — Instant Bank Account");
    await expect(fl.getByTestId("knowledge-match-inherited")).toContainText("not printed in this state's entry");
    await expect(fl.getByTestId("knowledge-match-direct")).toHaveCount(0);
    const az = resultFor(page, "AZ");
    await expect(az.getByTestId("knowledge-match-direct")).toContainText("Matched in: Additional Services Available");
    await expect(az.getByTestId("knowledge-match-inherited")).toHaveCount(0);
  });

  test("the topic filter uses effective metadata and labels inherited matches", async ({ page }) => {
    await page.getByTestId("knowledge-filter-topic").selectOption("banking");
    await expect(page).toHaveURL(/topic=banking/);
    await expect(results(page)).toHaveCount(5);
    await expect(resultFor(page, "DE").getByTestId("knowledge-match-inherited")).toContainText("Banking");
    await expect(resultFor(page, "CA").getByTestId("knowledge-match-direct")).toContainText("Topic in this state's entry");
    await page.getByTestId("knowledge-filter-state").selectOption("WY");
    expect(await jurisdictions(page)).toEqual(["WY"]);
    // Back restores the previous filters.
    await page.goBack();
    await expect(results(page)).toHaveCount(5);
  });
});

test.describe("article reader", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, EMAIL.csr);
  });

  test("Arizona: the Open Research Item is visibly unresolved", async ({ page }) => {
    await page.goto("/knowledge");
    await resultFor(page, "AZ").click();
    await expect(page).toHaveURL(/\/knowledge\/arizona-llc-services-and-requirements$/);
    const ori = page.getByTestId("knowledge-section-open_research_item_publication");
    await expect(ori).toHaveAttribute("data-flag", "open_research_item");
    await expect(ori).toHaveAttribute("data-verification", "unverified");
    await expect(ori.getByTestId("knowledge-section-badge-open_research_item_publication")).toHaveText("Open research item · Unresolved");
    await expect(ori).toContainText("LLC applicability has not been verified in our documentation.");
    // Sections render in stored order.
    const keys = await page.locator('[data-testid^="knowledge-section-"][data-flag]').evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-testid")!.replace("knowledge-section-", "")),
    );
    expect(keys[0]).toBe("formation_filing");
    expect(keys.at(-1)).toBe("open_research_item_publication");
    expect(keys).toHaveLength(10);
    await expect(page.getByTestId("knowledge-internal-notice")).toContainText("Internal reference.");
    await expect(page.getByTestId("knowledge-internal-notice")).toContainText("has not been reviewed by counsel");
  });

  test("California: the franchise-tax client disclosure renders as required", async ({ page }) => {
    await page.goto(`/knowledge/${CA_SLUG}`);
    const ft = page.getByTestId("knowledge-section-franchise_tax");
    await expect(ft).toHaveAttribute("data-flag", "client_disclosure");
    await expect(ft.getByTestId("knowledge-section-badge-franchise_tax")).toHaveText("Client disclosure · Required");
    await expect(ft).toContainText("A California LLC therefore owes $800 in its first taxable year.");
  });

  test("Florida, Delaware, Wyoming: inherited shared services sit beside the entry, not in it", async ({ page }) => {
    for (const [slug, code] of [
      ["florida-llc-services-and-requirements", "FL"],
      ["delaware-llc-services-and-requirements", "DE"],
      ["wyoming-llc-services-and-requirements", "WY"],
    ]) {
      await page.goto(`/knowledge/${slug}`);
      const row = page.getByTestId("knowledge-service-instant_bank_account");
      await expect(row, code).toHaveAttribute("data-status", "inherited");
      await expect(row, code).toHaveAttribute("data-direct", "false");
      await expect(row.getByTestId("knowledge-service-status-instant_bank_account")).toHaveText("Applies from a national source statement");
      await expect(row).toContainText("Source document — LLC Formation Services by State → WHAT VARIES BY STATE, AND WHAT DOES NOT (p. 3)");
      await expect(page.getByTestId("knowledge-section-additional_services_available")).not.toContainText("Instant Bank Account");
    }
    await page.goto("/knowledge/florida-llc-services-and-requirements");
    await expect(page.getByTestId("knowledge-section-additional_services_available")).toContainText(FL_TEXT);
    await expect(page.getByTestId("knowledge-caveat-boi_compliance")).toContainText("fulfillment pipeline as unverified");
  });

  test("a disputed service is shown as a source discrepancy, not as available", async ({ page }) => {
    await page.goto("/knowledge/delaware-llc-services-and-requirements");
    const disputed = page.getByTestId("knowledge-disputed-corporate_binder_seal");
    await expect(disputed).toHaveAttribute("data-status", "disputed");
    await expect(disputed).toContainText("Source discrepancy — not confirmed");
    await expect(disputed).toContainText("priced flat nationally");
    await expect(disputed).toContainText("State-varying services include");
    await expect(page.getByTestId("knowledge-service-status-corporate_binder_seal")).toHaveText("Source discrepancy — not confirmed");
    await expect(page.getByTestId("knowledge-disputed-convert_llc_to_close_llc")).toContainText("Products restricted to Wyoming");
  });

  test("a direct article URL with a section anchor survives a refresh", async ({ page }) => {
    await page.goto(`/knowledge/${CA_SLUG}#franchise_tax`);
    await expect(page.getByTestId("knowledge-article-title")).toHaveText("California — LLC Services & Requirements");
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/knowledge/${CA_SLUG}#franchise_tax$`));
    await expect(page.getByTestId("knowledge-article-title")).toBeVisible();
    // The page scrolled to the anchored section (not left at the top).
    await expect(page.getByTestId("knowledge-section-franchise_tax")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.getByTestId("no-access")).toHaveCount(0);
  });
});
