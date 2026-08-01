import { expect, test } from "@playwright/test";
import { CONSOLE, expectAuthReady, HUB, login } from "./fixtures.js";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function containsOrgId(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsOrgId);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => key === "orgId" || containsOrgId(nested));
  }
  return false;
}

test.describe("BOLA UI", () => {
  test("never sends orgId on data fetches except switch-org", async ({ page }) => {
    const violations: string[] = [];
    let observedDataRequests = 0;
    const observedPaths = new Set<string>();
    const apiOrigin = new URL(API).origin;

    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== apiOrigin) {
        return;
      }

      if (url.pathname.endsWith("/auth/switch-org")) {
        return;
      }

      if (!url.pathname.includes("/auth/")) {
        observedDataRequests += 1;
        observedPaths.add(url.pathname);
      }

      if ([...url.searchParams.keys()].includes("orgId")) {
        violations.push(`Query contained orgId: ${url.toString()}`);
      }

      const postData = request.postData();
      if (postData) {
        try {
          if (containsOrgId(request.postDataJSON())) {
            violations.push(`JSON body contained orgId: ${postData}`);
          }
        } catch {
          if (new URLSearchParams(postData).has("orgId")) {
            violations.push(`Form body contained orgId: ${postData}`);
          }
        }
      }
    });

    await login(page, "alice@acme.com", "password123", HUB);
    await page.goto(`${HUB}/tickets`);
    await expect(page).toHaveURL(/\/tickets$/);
    await page.goto(`${CONSOLE}/prs`);
    await expect(page).toHaveURL(/\/prs$/);
    await expectAuthReady(page);

    expect(observedDataRequests).toBeGreaterThanOrEqual(2);
    expect([...observedPaths].some((path) => path.endsWith("/tickets"))).toBe(true);
    expect([...observedPaths].some((path) => path.endsWith("/prs"))).toBe(true);
    expect(violations).toEqual([]);
  });

  test("renders single-org switcher as a span", async ({ page }) => {
    await login(page, "alice@acme.com", "password123", HUB);
    const switcher = page.getByTestId("org-switcher");
    await expect(switcher).toHaveAttribute("data-single-org", "true");
    await expect(switcher).toHaveText(/Acme Corp/i);
  });
});
