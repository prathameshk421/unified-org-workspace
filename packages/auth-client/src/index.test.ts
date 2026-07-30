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
  it("exposes request for credentialed API calls", async () => {
    const expected = { tickets: [{ id: "ticket-1", title: "Billing" }] };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.test/tickets");
      expect(init).toMatchObject({
        credentials: "include",
        cache: "no-store",
      });
      return jsonResponse(expected);
    });

    const client = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.request<typeof expected>("/tickets")).resolves.toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

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

  it("omits default Content-Type for FormData bodies", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Content-Type")).toBeNull();
      return jsonResponse({ id: "att-1" }, 201);
    });

    const client = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchImpl: fetchMock as typeof fetch,
    });

    const form = new FormData();
    form.append("file", new Blob(["hello"]), "note.txt");

    await client.request("/tickets/t1/attachments", {
      method: "POST",
      body: form,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requestBlob returns blob and retries once after 401", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const path = new URL(String(input)).pathname;
      if (path === "/auth/refresh") {
        return jsonResponse({ ok: true });
      }
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      return new Response("file-bytes", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    });

    const client = createAuthClient({
      baseUrl: "https://api.example.test",
      fetchImpl: fetchMock as typeof fetch,
    });

    const blob = await client.requestBlob("/tickets/t1/attachments/a1/download");
    expect(await blob.text()).toBe("file-bytes");
    expect(calls).toBe(2);
  });
});
