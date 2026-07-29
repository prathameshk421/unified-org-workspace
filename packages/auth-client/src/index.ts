import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  RegisterRequest,
  RegisterResponse,
  SwitchOrgRequest,
  SwitchOrgResponse,
} from "@unified/types";

export const AUTH_CLIENT_VERSION = "0.1.0";

export const ACCESS_COOKIE_NAME = "unified_access";
export const REFRESH_COOKIE_NAME = "unified_refresh";

export interface AuthClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
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

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function createAuthClient(options: AuthClientOptions): AuthClient {
  const fetchFn = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    return parseJson<T>(response);
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
      await request<{ ok: true }>("/auth/logout", { method: "POST" });
    },

    async logoutEverywhere() {
      await request<{ ok: true }>("/auth/logout-everywhere", {
        method: "POST",
      });
    },

    async refresh() {
      await request<{ ok: true }>("/auth/refresh", { method: "POST" });
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
