import { expect, test, type Page } from "@playwright/test";
import { CONSOLE, HUB, login } from "./fixtures.js";

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
    await login(page, "bob@acme.com", "password123", HUB);
    await page.getByTestId("logout-everywhere").click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto(`${HUB}/`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("org switcher for multi-org user", async ({ page, context }) => {
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

    const firstOrgName = await page.getByTestId("active-org").innerText();

    await select.selectOption(other!);
    await expect(select).toHaveValue(other!);
    await expect(page.getByTestId("active-org")).not.toHaveText(firstOrgName, {
      timeout: 10_000,
    });

    // Sibling dashboard should see the same active org after navigation.
    const consolePage = await context.newPage();
    await consolePage.goto(`${CONSOLE}/`);
    await expect(consolePage.getByTestId("auth-status")).toContainText(
      "dave@example.com",
    );
    await expect(consolePage.getByTestId("active-org")).toHaveText(
      await page.getByTestId("active-org").innerText(),
      { timeout: 10_000 },
    );
  });
});
