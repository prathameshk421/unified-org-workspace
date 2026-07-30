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
}

export async function login(page: Page, email: string, password: string, baseUrl: string) {
  await gotoLogin(page, baseUrl);
  await submitLogin(page, email, password);
  await expect(page.getByTestId("auth-status")).toContainText(email);
}
