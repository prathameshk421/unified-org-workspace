import { expect, test } from "@playwright/test";
import { HUB, login } from "./fixtures.js";

test.describe("BOLA UI", () => {
  test("never sends orgId on data fetches except switch-org", async ({
    page,
  }) => {
    const violations: string[] = [];

    page.on("request", (request) => {
      const url = request.url();
      if (!url.includes("/auth/")) {
        return;
      }

      if (url.includes("/auth/switch-org")) {
        return;
      }

      if (url.includes("orgId")) {
        violations.push(`URL contained orgId: ${url}`);
      }

      const postData = request.postData();
      if (postData?.includes("orgId")) {
        violations.push(`Body contained orgId: ${postData}`);
      }
    });

    await login(page, "alice@acme.com", "password123", HUB);
    await page.reload();
    await expect(page.getByTestId("auth-status")).toContainText("alice@acme.com");

    expect(violations).toEqual([]);
  });

  test("renders single-org switcher as a span", async ({ page }) => {
    await login(page, "alice@acme.com", "password123", HUB);
    const switcher = page.getByTestId("org-switcher");
    await expect(switcher).toHaveAttribute("data-single-org", "true");
    await expect(switcher).toHaveText(/Acme Corp/i);
  });
});
