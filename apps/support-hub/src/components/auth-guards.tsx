"use client";

import { useAuth } from "@unified/auth-client/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

function safeReturnTo(raw: string | null, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status === "unauthenticated") {
      const qs = searchParams.toString();
      const returnTo = encodeURIComponent(qs ? `${pathname}?${qs}` : pathname);
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [status, router, pathname, searchParams]);

  if (status === "loading") {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-surface-muted"
        data-testid="auth-loading"
      >
        <p className="text-muted">Loading session…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-surface-muted"
        data-testid="auth-loading"
      >
        <p className="text-muted">Redirecting to login…</p>
      </main>
    );
  }

  return <>{children}</>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status === "authenticated") {
      const returnTo = safeReturnTo(searchParams.get("returnTo"), "/");
      router.replace(returnTo);
    }
  }, [status, router, searchParams]);

  if (status === "loading") {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-surface-muted"
        data-testid="auth-loading"
      >
        <p className="text-muted">Loading session…</p>
      </main>
    );
  }

  if (status === "authenticated") {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-surface-muted"
        data-testid="auth-loading"
      >
        <p className="text-muted">Redirecting…</p>
      </main>
    );
  }

  return <>{children}</>;
}
