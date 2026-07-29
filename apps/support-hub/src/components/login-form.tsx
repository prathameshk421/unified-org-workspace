"use client";

import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

function safeReturnTo(raw: string | null, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

export function LoginForm({ appName }: { appName: string }) {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login({ email, password });
      router.replace(safeReturnTo(searchParams.get("returnTo"), "/"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-muted px-6">
      <div className="w-full max-w-md">
        <p className="text-center text-sm font-medium uppercase tracking-wide text-brand-600">
          Unified Org Workspace
        </p>
        <h1 className="mt-2 text-center text-3xl font-semibold text-foreground">
          Sign in to {appName}
        </h1>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-8 space-y-4 rounded-lg border border-border bg-surface p-6"
          data-testid="login-form"
        >
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-muted">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-muted">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600" data-testid="login-error">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="login-submit"
          >
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
