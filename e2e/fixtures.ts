import { expect, type Page } from "@playwright/test";

const HUB = process.env.HUB_URL ?? "http://localhost:3000";
const CONSOLE = process.env.CONSOLE_URL ?? "http://localhost:3001";

export { HUB, CONSOLE };

export async function gotoLogin(page: Page, baseUrl: string, returnTo?: string) {
  const query = returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;
  await page.goto(`${baseUrl}/login${query}`);
}

export async function submitLogin(page: Page, email: string, password: string) {
  await page.fill("[name=email]", email);
  await page.fill("[name=password]", password);

  const loginResponse = page.waitForResponse(
    (response) => response.url().includes("/auth/login") && response.request().method() === "POST",
  );
  await page.click("[data-testid=login-submit]");
  const response = await loginResponse;

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Login failed for ${email} (${response.status()}): ${body}. ` +
        "If status is 429, restart the API with AUTH_RATE_LIMIT_MAX=1000.",
    );
  }

  const me = await page.waitForResponse(
    (r) =>
      r.url().includes("/auth/me") &&
      r.request().method() === "GET" &&
      r.status() === 200,
  );
  if (!me.ok()) {
    const body = await me.text();
    throw new Error(`Session hydrate failed for ${email} (${me.status()}): ${body}`);
  }
}

/** Authenticated chrome is ready (user menu visible). */
export async function expectAuthReady(page: Page, email?: string) {
  await expect(page.getByTestId("user-menu-trigger")).toBeVisible({ timeout: 15_000 });
  if (email) {
    await expect(page.getByTestId("auth-status")).toContainText(email);
  }
}

export async function login(page: Page, email: string, password: string, baseUrl: string) {
  await gotoLogin(page, baseUrl);
  await submitLogin(page, email, password);
  await expectAuthReady(page, email);
}

async function openUserMenu(page: Page) {
  const trigger = page.getByTestId("user-menu-trigger");
  await expect(trigger).toBeVisible({ timeout: 15_000 });

  const logout = page.getByTestId("logout");
  if (!(await logout.isVisible())) {
    await trigger.click();
  }
  await expect(logout).toBeVisible({ timeout: 5_000 });
}

export async function clickLogout(page: Page) {
  await openUserMenu(page);
  const btn = page
    .getByTestId("logout")
    .or(page.getByRole("button", { name: /^sign out$/i }));
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
}

export async function clickLogoutEverywhere(page: Page) {
  await openUserMenu(page);
  const btn = page
    .getByTestId("logout-everywhere")
    .or(page.getByRole("button", { name: /logout everywhere|sign out everywhere/i }));
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
}
