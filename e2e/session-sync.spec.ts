import { expect, test, type Page } from "@playwright/test";

const HUB = process.env.HUB_URL ?? "http://localhost:3000";
const CONSOLE = process.env.CONSOLE_URL ?? "http://localhost:3001";

async function login(page: Page, email: string, password: string, baseUrl: string) {
  await page.goto(`${baseUrl}/login`);
  await page.fill('[name=email]', email);
  await page.fill('[name=password]', password);
  await page.click('[data-testid=login-submit]');
  await expect(page.getByTestId("auth-status")).toContainText(email);
}

test.describe("session sync", () => {
  test("login on hub is recognized on console", async ({ page, context }) => {
    await login(page, "alice@acme.com", "password123", HUB);

    const consolePage = await context.newPage();
    await consolePage.goto(`${CONSOLE}/`);
    await expect(consolePage.getByTestId("auth-status")).toContainText(
      "alice@acme.com",
    );
  });

  test("logout on hub logs out console", async ({ page, context }) => {
    await login(page, "alice@acme.com", "password123", HUB);

    const consolePage = await context.newPage();
    await consolePage.goto(`${CONSOLE}/`);
    await expect(consolePage.getByTestId("auth-status")).toContainText(
      "alice@acme.com",
    );

    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/login/);

    await consolePage.goto(`${CONSOLE}/`);
    await expect(consolePage).toHaveURL(/\/login/);
  });

  test("logout-everywhere invalidates session", async ({ page }) => {
    await login(page, "alice@acme.com", "password123", HUB);
    await page.getByTestId("logout-everywhere").click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto(`${HUB}/`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("org switcher for multi-org user", async ({ page }) => {
    await login(page, "dave@example.com", "password123", HUB);
    await expect(page.getByTestId("org-switcher")).toBeVisible();

    const select = page.getByTestId("org-switcher");
    const options = select.locator("option");
    await expect(options).toHaveCount(2);

    const firstValue = await select.inputValue();
    const allValues = await options.evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value),
    );
    const other = allValues.find((v) => v && v !== firstValue);
    expect(other).toBeTruthy();

    await select.selectOption(other!);
    await expect(page.getByTestId("active-org")).not.toHaveText("", {
      timeout: 10_000,
    });
    // After switch, select value reflects new active org
    await expect(select).toHaveValue(other!);
  });
});
