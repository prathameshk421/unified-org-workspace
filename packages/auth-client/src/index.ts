import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  RegisterRequest,
  RegisterResponse,
  SwitchOrgRequest,
  SwitchOrgResponse,
} from "@unified/types";

export const AUTH_CLIENT_VERSION = "0.2.0";

export const ACCESS_COOKIE_NAME = "unified_access";
export const REFRESH_COOKIE_NAME = "unified_refresh";

export interface AuthClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class AuthError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

export interface AuthClient {
  login(input: LoginRequest): Promise<LoginResponse>;
  register(input: RegisterRequest): Promise<RegisterResponse>;
  logout(): Promise<void>;
  logoutEverywhere(): Promise<void>;
  refresh(): Promise<void>;
  me(): Promise<MeResponse>;
  switchOrg(input: SwitchOrgRequest): Promise<SwitchOrgResponse>;
}

const NO_RETRY_PATHS = new Set(["/auth/refresh", "/auth/login", "/auth/register"]);

let refreshPromise: Promise<void> | null = null;

async function parseJson<T>(response: Response): Promise<T> {
  let body: { error?: string; code?: string } | undefined;
  try {
    body = (await response.json()) as { error?: string; code?: string };
  } catch {
    // ignore parse errors
  }

  if (!response.ok) {
    throw new AuthError(
      body?.error ?? `Request failed with status ${response.status}`,
      response.status,
      body?.code,
    );
  }

  return body as T;
}

export function createAuthClient(options: AuthClientOptions): AuthClient {
  const fetchFn = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
    return fetchFn(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  }

  async function refreshSingleFlight(): Promise<void> {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const response = await rawRequest("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({}),
        });
        await parseJson<{ ok: true }>(response);
      })().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await rawRequest(path, init);

    if (response.status === 401 && !NO_RETRY_PATHS.has(path)) {
      try {
        await refreshSingleFlight();
      } catch {
        // Refresh failed — surface original 401 below after re-parse, or throw refresh error
        throw new AuthError("Session expired", 401, "session_expired");
      }

      const retry = await rawRequest(path, init);
      return parseJson<T>(retry);
    }

    return parseJson<T>(response);
  }

  async function logoutWithRefresh(
    path: "/auth/logout" | "/auth/logout-everywhere",
  ): Promise<void> {
    try {
      await request<{ ok: true }>(path, {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) {
        // Access expired: refresh then retry once (request() already tries refresh;
        // if still failing, attempt explicit refresh + one more logout).
        try {
          await refreshSingleFlight();
          await request<{ ok: true }>(path, {
            method: "POST",
            body: JSON.stringify({}),
          });
          return;
        } catch {
          // Session already dead — treat as logged out
          return;
        }
      }
      throw error;
    }
  }

  return {
    async login(input) {
      return request<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    async register(input) {
      return request<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    async logout() {
      await logoutWithRefresh("/auth/logout");
    },

    async logoutEverywhere() {
      await logoutWithRefresh("/auth/logout-everywhere");
    },

    async refresh() {
      await refreshSingleFlight();
    },

    async me() {
      return request<MeResponse>("/auth/me");
    },

    async switchOrg(input) {
      return request<SwitchOrgResponse>("/auth/switch-org", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  };
}
