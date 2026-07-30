import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "./index.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createAuthClient", () => {
  it("single-flights refresh for concurrent unauthorized requests", async () => {
    const concurrentRequests = 3;
    const initialUnauthorized = deferred<Response>();
    const refreshResponse = deferred<Response>();
    const refreshStarted = deferred<void>();
    let meCalls = 0;
    let refreshCalls = 0;

    const expectedMe = {
      user: {
        id: "user-1",
        email: "alice@example.com",
        name: "Alice",
        isPlatformAdmin: false,
      },
      memberships: [],
      activeOrg: null,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const path = new URL(String(input)).pathname;

      if (path === "/auth/me") {
        meCalls += 1;
        if (meCalls <= concurrentRequests) {
          return initialUnauthorized.promise;
        }
        return jsonResponse(expectedMe);
      }

      if (path === "/auth/refresh") {
        refreshCalls += 1;
        refreshStarted.resolve();
        return refreshResponse.promise;
      }

      throw new Error(`Unexpected request to ${path}`);
    });
    const client = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchImpl: fetchMock as typeof fetch,
    });

    const requests = Array.from({ length: concurrentRequests }, () => client.me());
    expect(meCalls).toBe(concurrentRequests);

    initialUnauthorized.resolve(jsonResponse({ error: "Unauthorized" }, 401));
    await refreshStarted.promise;
    expect(refreshCalls).toBe(1);

    refreshResponse.resolve(jsonResponse({ ok: true }));

    await expect(Promise.all(requests)).resolves.toEqual(
      Array.from({ length: concurrentRequests }, () => expectedMe),
    );
    expect(refreshCalls).toBe(1);
    expect(meCalls).toBe(concurrentRequests * 2);
  });
});
