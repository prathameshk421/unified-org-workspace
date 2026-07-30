import { expect, test } from "@playwright/test";
import { HUB, gotoLogin, login, submitLogin } from "./fixtures.js";

const RETURN_TO_MARKER = "/?e2e=returnTo";

test.describe("auth guards", () => {
  test("redirects unauthenticated users to login with returnTo", async ({ page }) => {
    await page.goto(`${HUB}${RETURN_TO_MARKER}`);
    await expect(page).toHaveURL(`${HUB}/login?returnTo=${encodeURIComponent(RETURN_TO_MARKER)}`);
  });

  test("returns to protected route after login", async ({ page }) => {
    await page.goto(`${HUB}${RETURN_TO_MARKER}`);
    await expect(page).toHaveURL(
      new RegExp(
        `/login\\?returnTo=${encodeURIComponent(RETURN_TO_MARKER).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    );

    await submitLogin(page, "alice@acme.com", "password123");
    await expect(page).toHaveURL(`${HUB}${RETURN_TO_MARKER}`);
    await expect(page.getByTestId("auth-status")).toContainText("alice@acme.com");
  });

  test("rejects open redirects via returnTo", async ({ page }) => {
    await gotoLogin(page, HUB, "//evil.com");
    await submitLogin(page, "alice@acme.com", "password123");
    await expect(page).toHaveURL(`${HUB}/`);

    await page.context().clearCookies();
    await gotoLogin(page, HUB, "https://evil.com");
    await submitLogin(page, "alice@acme.com", "password123");
    await expect(page).toHaveURL(`${HUB}/`);
  });

  test("redirects authenticated users away from login", async ({ page }) => {
    await login(page, "alice@acme.com", "password123", HUB);
    await page.goto(`${HUB}/login`);
    await expect(page).toHaveURL(`${HUB}/`);
  });

  test("does not redirect to login while auth is loading", async ({ page }) => {
    await login(page, "alice@acme.com", "password123", HUB);

    await page.route("**/auth/me", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await route.continue();
    });

    await page.goto(`${HUB}/`);
    await expect(page.getByTestId("auth-loading")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId("auth-status")).toContainText("alice@acme.com", {
      timeout: 15_000,
    });
  });
});
