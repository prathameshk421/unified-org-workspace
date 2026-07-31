import { expect, test } from "@playwright/test";
import {
  CONSOLE,
  HUB,
  clickLogoutEverywhere,
  expectAuthReady,
  login,
} from "./fixtures.js";

test.describe("token revocation", () => {
  test.setTimeout(90_000);

  test("logout-everywhere invalidates another browser context", async ({ browser }) => {
    const first = await browser.newContext();
    const second = await browser.newContext();

    const pageA = await first.newPage();
    const pageB = await second.newPage();

    await login(pageA, "bob@acme.com", "password123", HUB);
    await login(pageB, "bob@acme.com", "password123", CONSOLE);

    await expectAuthReady(pageA);
    await expectAuthReady(pageB);

    await clickLogoutEverywhere(pageA);
    await expect(pageA).toHaveURL(/\/login/);

    await pageB.goto(`${CONSOLE}/`);
    await expect(pageB).toHaveURL(/\/login/);

    await first.close();
    await second.close();
  });

  test("refresh recovers after browser access-cookie loss", async ({ page }) => {
    await login(page, "carol@globex.com", "password123", HUB);

    const cookies = await page.context().cookies();
    const access = cookies.find((cookie) => cookie.name === "unified_access");
    expect(access).toBeTruthy();

    await page.context().clearCookies();
    for (const cookie of cookies) {
      if (cookie.name !== "unified_access") {
        await page.context().addCookies([cookie]);
      }
    }

    await page.reload();
    await expectAuthReady(page, "carol@globex.com");
    await expect(page).not.toHaveURL(/\/login/);
  });
});
