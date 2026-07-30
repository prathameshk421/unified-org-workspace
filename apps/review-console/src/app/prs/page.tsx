import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/auth-guards";
import { PrListPage } from "@/components/prs/pr-list";

export default function PrsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <PrListPage />
      </AppShell>
    </ProtectedRoute>
  );
}
