import { expect, type Page } from "@playwright/test";

export const PASSWORD = "test123";

export const EMAIL = {
  systemOwner: "iris@example.com",
  csr: "devon@example.com",
  csrSupervisor: "nadia@example.com",
  businessAdvisor: "leo@example.com",
  baSupervisor: "grace@example.com",
  admin: "omar@example.com",
  adminSupervisor: "rachel@example.com",
  hr: "tessa@example.com",
} as const;

/** Signs in through the login form and waits for the app shell. */
export async function login(page: Page, email: string) {
  if (!page.url().startsWith("http")) await page.goto("/");
  await page.getByPlaceholder("iris@example.com").fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByTestId("nav-dashboard")).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByTestId("sign-out").click();
  await expect(page.locator('input[type="password"]')).toBeVisible();
}

/** The sidebar entries currently rendered, in order (nav-account excluded). */
export async function sidebar(page: Page): Promise<string[]> {
  const ids = await page
    .locator('aside [data-testid^="nav-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!));
  return ids.filter((id) => id !== "nav-account").map((id) => id.replace(/^nav-/, ""));
}

/** Test ids with a prefix currently in the page, e.g. records-tab-. */
export async function testIds(page: Page, prefix: string): Promise<string[]> {
  const ids = await page
    .locator(`[data-testid^="${prefix}"]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!));
  return ids.map((id) => id.slice(prefix.length));
}
