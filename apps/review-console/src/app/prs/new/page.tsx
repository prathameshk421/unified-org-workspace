import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/auth-guards";
import { PrCreateForm } from "@/components/prs/pr-create-form";

export default function NewPrPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <PrCreateForm />
      </AppShell>
    </ProtectedRoute>
  );
}
