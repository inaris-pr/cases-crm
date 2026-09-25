import { test, expect, type Page } from "@playwright/test";
import { EMAIL, login } from "./helpers";

/**
 * Phase 7 follow-up — the Case Thread as a unified timeline: human comments
 * interleaved with system activity from GET /api/cases/:id/feed.
 * Each test works on its own new Case.
 */

async function newCase(page: Page, title: string) {
  const res = await page.request.post("/api/cases", { data: { title, accountId: 1 } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number };
}
const openTab = (page: Page, name: RegExp) => page.getByRole("button", { name }).first().click();
const feed = (page: Page, type: string) => page.locator(`[data-testid="case-feed"] [data-testid="feed-${type}"]`);
/** The timeline's entries, top to bottom, as rendered. */
const feedOrder = (page: Page) =>
  page
    .locator('[data-testid="case-feed"] > [data-testid^="feed-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));

test("comment, category, priority and reassignment all appear in Thread, in order", async ({ page }) => {
  await login(page, EMAIL.systemOwner);
  const c = await newCase(page, `Thread basics ${Date.now()}`);
  await page.goto(`/cases/${c.id}`);

  await openTab(page, /^Thread/);
  await page.getByPlaceholder(/Share a note with the team about this case/).fill("Called the Secretary of State");
  await page.getByRole("button", { name: /^Post$/ }).click();
  await expect(feed(page, "comment")).toContainText("Called the Secretary of State");

  await page.getByTestId("case-category-select").selectOption("compliance");
  await expect(feed(page, "category_change")).toContainText("Compliance");
  await expect(feed(page, "category_change")).toContainText("Uncategorized");

  await page.getByTestId("case-priority-select").selectOption("high");
  await expect(feed(page, "priority_change")).toContainText("Medium");
  await expect(feed(page, "priority_change")).toContainText("High");
  await expect(feed(page, "priority_change")).toContainText("Changed by Iris Burgos");

  await page.getByTestId("reassign-open").click();
  await page.getByTestId("reassign-select").selectOption({ label: "Sara Mitchell" });
  await page.getByTestId("reassign-confirm").click();
  await expect(feed(page, "owner_change")).toContainText("Sara Mitchell");
  await expect(feed(page, "owner_change")).toContainText("Reassigned by Iris Burgos");

  // Newest first: the last action is on top.
  expect(await feedOrder(page)).toEqual(["feed-owner_change", "feed-priority_change", "feed-category_change", "feed-comment"]);
  await expect(page.getByTestId("thread-count")).toHaveText("4");
});

test("newest first: a new comment lands on top, a new call lifts its card, reload keeps the order", async ({ page }) => {
  await login(page, EMAIL.systemOwner);
  const c = await newCase(page, `Thread order ${Date.now()}`);
  const call = async (summary: string) => {
    const res = await page.request.post(`/api/cases/${c.id}/contacts`, { data: { direction: "outbound", channel: "phone", summary, contact: "Amelia" } });
    expect(res.status()).toBe(201);
  };
  // In sequence: a call, a category change, a priority change.
  await call("First outbound");
  await page.request.patch(`/api/cases/${c.id}`, { data: { category: "ein_tax" } });
  await page.request.patch(`/api/cases/${c.id}`, { data: { priority: "high" } });

  await page.goto(`/cases/${c.id}`);
  await openTab(page, /^Thread/);
  await expect(page.getByTestId("thread-count")).toHaveText("3");
  expect(await feedOrder(page)).toEqual(["feed-priority_change", "feed-category_change", "feed-calls_outgoing_summary"]);
  // Nothing scrolls the page to the bottom: the composer and the newest
  // activity are what the employee sees.
  await expect(page.getByPlaceholder(/Share a note with the team about this case/)).toBeInViewport();
  await expect(page.locator('[data-testid="case-feed"] > [data-testid^="feed-"]').first()).toBeInViewport();

  await page.getByPlaceholder(/Share a note with the team about this case/).fill("Newest note");
  await page.getByRole("button", { name: /^Post$/ }).click();
  await expect(feed(page, "comment")).toContainText("Newest note");
  expect(await feedOrder(page)).toEqual([
    "feed-comment", "feed-priority_change", "feed-category_change", "feed-calls_outgoing_summary",
  ]);

  await call("Second outbound");
  await page.reload();
  await openTab(page, /^Thread/);
  await expect(feed(page, "calls_outgoing_summary").getByTestId("call-count")).toHaveText("2 calls");
  const expected = ["feed-calls_outgoing_summary", "feed-comment", "feed-priority_change", "feed-category_change"];
  expect(await feedOrder(page)).toEqual(expected);
  await expect(page.getByTestId("thread-count")).toHaveText("4");

  await page.reload();
  await openTab(page, /^Thread/);
  await expect(feed(page, "calls_outgoing_summary")).toBeVisible();
  expect(await feedOrder(page)).toEqual(expected);
});

test("task created and completed, and an uploaded document with a clickable name", async ({ page }) => {
  await login(page, EMAIL.systemOwner);
  const c = await newCase(page, `Thread tasks ${Date.now()}`);
  await page.goto(`/cases/${c.id}`);

  await openTab(page, /^Tasks/);
  await page.getByPlaceholder("Describe the task…").fill("Prepare amendment filing");
  await page.getByRole("button", { name: /^Add$/ }).click();
  const cycle = page.locator('[data-testid^="task-cycle-"]').first();
  await expect(cycle).toBeVisible();
  await cycle.click(); // pending → in progress
  await expect(page.getByText("In progress").first()).toBeVisible();
  await cycle.click(); // in progress → completed
  await expect(page.getByText("Completed").first()).toBeVisible();

  await openTab(page, /^Documents/);
  await page.getByTestId("document-filename").fill("Articles of Organization.pdf");
  await page.getByTestId("document-url").fill("https://example.com/docs/articles.pdf");
  await page.getByRole("button", { name: /Upload/ }).click();
  await expect(page.getByText("Articles of Organization.pdf").first()).toBeVisible();

  await openTab(page, /^Thread/);
  await expect(feed(page, "task_created")).toContainText("Prepare amendment filing");
  await expect(feed(page, "task_created")).toContainText("Created by Iris Burgos");
  await expect(feed(page, "task_completed")).toContainText("Completed by Iris Burgos");
  const link = feed(page, "document_uploaded").getByTestId("feed-document-link");
  await expect(link).toHaveText("Articles of Organization.pdf");
  await expect(link).toHaveAttribute("href", "https://example.com/docs/articles.pdf");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(feed(page, "document_uploaded")).toContainText("Uploaded by Iris Burgos");
});

test("outgoing and incoming calls each show as ONE card with the right count", async ({ page }) => {
  await login(page, EMAIL.csr);
  const c = await newCase(page, `Thread calls ${Date.now()}`);
  await page.goto(`/cases/${c.id}`);

  // One outbound call through the Contacts form, the rest through the API.
  await openTab(page, /^Contacts/);
  await page.getByTestId("contact-direction").selectOption("outbound");
  await page.getByTestId("contact-channel").selectOption("phone");
  await page.getByPlaceholder("Who from the client side?").fill("Amelia");
  await page.getByPlaceholder("What was discussed?").fill("Left a voicemail about the filing");
  await page.getByRole("button", { name: /Log contact/ }).click();
  await expect(page.getByText("Left a voicemail about the filing")).toBeVisible();
  for (const [direction, summary] of [
    ["outbound", "Second outbound"],
    ["outbound", "Third outbound"],
    ["inbound", "Client asked about EIN"],
    ["inbound", "Client confirmed address"],
  ]) {
    const res = await page.request.post(`/api/cases/${c.id}/contacts`, { data: { direction, channel: "phone", summary, contact: "Amelia" } });
    expect(res.status()).toBe(201);
  }

  await page.reload();
  await openTab(page, /^Thread/);
  await expect(feed(page, "calls_outgoing_summary")).toHaveCount(1);
  await expect(feed(page, "calls_incoming_summary")).toHaveCount(1);
  await expect(feed(page, "calls_outgoing_summary").getByTestId("call-count")).toHaveText("3 calls");
  await expect(feed(page, "calls_incoming_summary").getByTestId("call-count")).toHaveText("2 calls");
  await expect(feed(page, "calls_outgoing_summary")).toContainText("Third outbound");
  await expect(feed(page, "calls_outgoing_summary")).toContainText("Called by Devon Park");
  await expect(page.getByTestId("thread-count")).toHaveText("2");

  await feed(page, "calls_outgoing_summary").getByTestId("view-call-details").click();
  await expect(page.getByPlaceholder("Who from the client side?")).toBeVisible();
  await expect(page.getByText("Second outbound")).toBeVisible();
});

test("escalation raised and resolved both stay in the timeline", async ({ page }) => {
  await login(page, EMAIL.systemOwner);
  const c = await newCase(page, `Thread escalation ${Date.now()}`);
  await page.goto(`/cases/${c.id}`);
  await page.getByTestId("escalate-open").click();
  await page.getByTestId("escalate-reason").selectOption({ label: "Deadline Risk" });
  await page.getByTestId("escalate-note").fill("Filing window closes Friday");
  await page.getByTestId("escalate-confirm").click();
  await page.getByTestId("escalation-resolve").click();
  await expect(page.getByTestId("escalation-banner")).toHaveCount(0);
  await openTab(page, /^Thread/);
  await expect(feed(page, "escalation_created")).toContainText("Deadline Risk");
  await expect(feed(page, "escalation_created")).toContainText("Filing window closes Friday");
  await expect(feed(page, "escalation_resolved")).toContainText("Resolved by Iris Burgos");
});

test("Business Advisor and HR get no Case Thread data", async ({ page }) => {
  for (const role of ["businessAdvisor", "hr"] as const) {
    await login(page, EMAIL[role]);
    const res = await page.request.get("/api/cases/1/feed");
    expect(res.status()).toBe(403);
    await page.goto("/cases/1");
    await expect(page.getByTestId("no-access")).toBeVisible();
    await expect(page.getByTestId("case-feed")).toHaveCount(0);
    await page.getByTestId("sign-out").click();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  }
});
