import { expect, test } from "@playwright/test";
import { HUB, clickLogout, expectAuthReady, login } from "./fixtures.js";

test.describe("cross-tab sync", () => {
  test.setTimeout(90_000);

  test("logout in one tab signs out the other without reload", async ({ context }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await login(pageA, "alice@acme.com", "password123", HUB);
    await pageB.goto(`${HUB}/`);
    await expectAuthReady(pageB, "alice@acme.com");

    await clickLogout(pageA);
    await expect(pageA).toHaveURL(/\/login/);
    await expect(pageB).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("org switch in one tab updates the other without reload", async ({ context }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await login(pageA, "dave@example.com", "password123", HUB);
    await pageB.goto(`${HUB}/`);
    await expectAuthReady(pageB, "dave@example.com");

    const select = pageA.getByTestId("org-switcher");
    const options = select.locator("option");
    const firstValue = await select.inputValue();
    const allValues = await options.evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value),
    );
    const other = allValues.find((value) => value && value !== firstValue);
    expect(other).toBeTruthy();

    const switchedOrgName = await options.evaluateAll((els, otherValue) => {
      const match = els.find((el) => (el as HTMLOptionElement).value === otherValue);
      return match?.textContent?.trim() ?? "";
    }, other!);

    await select.selectOption(other!);
    await expect(pageA.getByTestId("active-org")).toHaveText(switchedOrgName, {
      timeout: 10_000,
    });
    await expect(pageB.getByTestId("active-org")).toHaveText(switchedOrgName, {
      timeout: 10_000,
    });
  });
});
