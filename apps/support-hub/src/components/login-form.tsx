"use client";

import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { Ticket } from "lucide-react";
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 font-sans text-xs font-medium text-muted">
          <Ticket className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
          Unified Org Workspace
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Sign in to <span className="text-brand-600">{appName}</span>
        </h1>
        <p className="mx-auto mt-3 max-w-sm font-serif text-base text-muted">
          Shared identity across Support Hub and Review Console.
        </p>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-10 space-y-4 border-t border-border pt-8 text-left"
          data-testid="login-form"
        >
          <div>
            <label htmlFor="email" className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted">
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
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm text-foreground transition-colors duration-200 focus:border-brand-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted">
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
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm text-foreground transition-colors duration-200 focus:border-brand-600 focus:outline-none"
            />
          </div>
          {error ? (
            <p className="font-sans text-sm text-brand-700" data-testid="login-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending} data-testid="login-submit">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
