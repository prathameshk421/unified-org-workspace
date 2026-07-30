"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type {
  ActiveOrgContext,
  AuthUser,
  LoginRequest,
  MembershipSummary,
  MeResponse,
} from "@unified/types";
import { AuthError, createAuthClient, type AuthClient } from "./index";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  activeOrg: ActiveOrgContext | null;
  memberships: MembershipSummary[];
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CHANNEL_NAME = "unified-auth";
const STORAGE_KEY = "unified-auth-event";

type AuthBroadcast =
  { type: "LOGIN" } | { type: "LOGOUT" } | { type: "ORG_SWITCHED" } | { type: "REFRESH_DONE" };

function broadcast(event: AuthBroadcast): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(event);
    channel.close();
  } catch {
    // BroadcastChannel unavailable
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...event, at: Date.now() }));
  } catch {
    // localStorage unavailable
  }
}

function clearSyncFlags(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface AuthProviderProps {
  apiBaseUrl: string;
  children: ReactNode;
}

export function AuthProvider({ apiBaseUrl, children }: AuthProviderProps) {
  const clientRef = useRef<AuthClient | null>(null);
  if (apiBaseUrl && !clientRef.current) {
    clientRef.current = createAuthClient({ baseUrl: apiBaseUrl });
  }
  const client = clientRef.current;

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeOrg, setActiveOrg] = useState<ActiveOrgContext | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const mountedRef = useRef(true);
  const hydrateGeneration = useRef(0);

  const applyMe = useCallback((me: MeResponse) => {
    if (!mountedRef.current) return;
    setUser(me.user);
    setActiveOrg(me.activeOrg);
    setMemberships(me.memberships);
    setStatus("authenticated");
  }, []);

  const clearSession = useCallback(() => {
    if (!mountedRef.current) return;
    setUser(null);
    setActiveOrg(null);
    setMemberships([]);
    setStatus("unauthenticated");
    clearSyncFlags();
  }, []);

  const hydrate = useCallback(async () => {
    if (!client) return;
    const generation = ++hydrateGeneration.current;
    try {
      const me = await client.me();
      if (generation !== hydrateGeneration.current || !mountedRef.current) return;
      applyMe(me);
    } catch (error) {
      if (generation !== hydrateGeneration.current || !mountedRef.current) return;
      if (error instanceof AuthError && error.status === 401) {
        clearSession();
        return;
      }
      clearSession();
    }
  }, [applyMe, clearSession, client]);

  useEffect(() => {
    mountedRef.current = true;
    if (!apiBaseUrl || !client) {
      clearSession();
      return () => {
        mountedRef.current = false;
      };
    }
    void hydrate();
    return () => {
      mountedRef.current = false;
    };
  }, [apiBaseUrl, client, clearSession, hydrate]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (message: MessageEvent<AuthBroadcast>) => {
        const event = message.data;
        if (!event?.type) return;
        if (event.type === "LOGOUT") {
          clearSession();
          return;
        }
        void hydrate();
      };
    } catch {
      // ignore
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const event = JSON.parse(e.newValue) as AuthBroadcast;
        if (event.type === "LOGOUT") {
          clearSession();
          return;
        }
        void hydrate();
      } catch {
        // ignore
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void hydrate();
      }
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      channel?.close();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clearSession, hydrate]);

  const login = useCallback(
    async (input: LoginRequest) => {
      if (!client) throw new Error("NEXT_PUBLIC_API_URL / apiBaseUrl is required");
      await client.login(input);
      const me = await client.me();
      applyMe(me);
      broadcast({ type: "LOGIN" });
    },
    [applyMe, client],
  );

  const logout = useCallback(async () => {
    try {
      if (client) await client.logout();
    } finally {
      clearSession();
      broadcast({ type: "LOGOUT" });
    }
  }, [clearSession, client]);

  const logoutEverywhere = useCallback(async () => {
    try {
      if (client) await client.logoutEverywhere();
    } finally {
      clearSession();
      broadcast({ type: "LOGOUT" });
    }
  }, [clearSession, client]);

  const switchOrg = useCallback(
    async (orgId: string) => {
      if (!client) throw new Error("NEXT_PUBLIC_API_URL / apiBaseUrl is required");
      await client.switchOrg({ orgId });
      const me = await client.me();
      applyMe(me);
      broadcast({ type: "ORG_SWITCHED" });
    },
    [applyMe, client],
  );

  const refetch = useCallback(async () => {
    await hydrate();
  }, [hydrate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      activeOrg,
      memberships,
      login,
      logout,
      logoutEverywhere,
      switchOrg,
      refetch,
    }),
    [status, user, activeOrg, memberships, login, logout, logoutEverywhere, switchOrg, refetch],
  );

  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL / apiBaseUrl is required");
  }

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export interface OrgSwitcherProps {
  className?: string;
  disabled?: boolean;
}

/**
 * Org switcher — calls POST /auth/switch-org only.
 * Never passes orgId to data fetches (BOLA).
 */
export function OrgSwitcher({ className, disabled }: OrgSwitcherProps) {
  const { status, activeOrg, memberships, switchOrg } = useAuth();

  if (status !== "authenticated" || memberships.length === 0) {
    return null;
  }

  if (memberships.length <= 1) {
    return createElement(
      "span",
      {
        className,
        "data-testid": "org-switcher",
        "data-single-org": "true",
      },
      activeOrg?.orgName ?? memberships[0]?.orgName ?? "Organization",
    );
  }

  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const orgId = event.target.value;
    if (!orgId || orgId === activeOrg?.orgId) return;
    void switchOrg(orgId);
  };

  return createElement(
    "select",
    {
      className,
      "data-testid": "org-switcher",
      value: activeOrg?.orgId ?? "",
      disabled: disabled ?? false,
      onChange,
      "aria-label": "Switch organization",
    },
    memberships.map((m) =>
      createElement(
        "option",
        {
          key: m.orgId,
          value: m.orgId,
          "data-testid": `org-option-${m.orgId}`,
        },
        m.orgName,
      ),
    ),
  );
}
