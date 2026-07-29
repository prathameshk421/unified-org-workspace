import { Suspense } from "react";
import { GuestRoute } from "../../components/auth-guards";
import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main
          className="flex min-h-screen items-center justify-center bg-surface-muted"
          data-testid="auth-loading"
        >
          <p className="text-muted">Loading…</p>
        </main>
      }
    >
      <GuestRoute>
        <LoginForm appName="Support Hub" />
      </GuestRoute>
    </Suspense>
  );
}
