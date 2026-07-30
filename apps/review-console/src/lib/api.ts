import { AuthError, createAuthClient } from "@unified/auth-client";

const NO_RETRY_PATHS = new Set(["/auth/refresh", "/auth/login", "/auth/register"]);

let authClient: ReturnType<typeof createAuthClient> | null = null;
let refreshPromise: Promise<void> | null = null;

function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is required");
  }
  return baseUrl.replace(/\/$/, "");
}

function getAuthClient() {
  if (!authClient) {
    authClient = createAuthClient({ baseUrl: getBaseUrl() });
  }
  return authClient;
}

async function refreshSingleFlight(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = getAuthClient()
      .refresh()
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${getBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

async function throwForResponse(response: Response): Promise<never> {
  let body: { error?: string; code?: string } | undefined;
  try {
    body = (await response.json()) as { error?: string; code?: string };
  } catch {
    // ignore parse errors
  }

  throw new AuthError(
    body?.error ?? `Request failed with status ${response.status}`,
    response.status,
    body?.code,
  );
}

async function requestWithRetry(path: string, init?: RequestInit): Promise<Response> {
  let response = await rawRequest(path, init);

  if (response.status === 401 && !NO_RETRY_PATHS.has(path)) {
    try {
      await refreshSingleFlight();
      response = await rawRequest(path, init);
    } catch {
      throw new AuthError("Session expired", 401, "session_expired");
    }
  }

  return response;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await requestWithRetry(path, init);

  if (!response.ok) {
    await throwForResponse(response);
  }

  return response.json() as Promise<T>;
}

export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await requestWithRetry(path);

  if (!response.ok) {
    await throwForResponse(response);
  }

  return response.blob();
}

export { AuthError };
