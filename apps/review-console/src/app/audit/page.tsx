import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/auth-guards";
import { AuditViewerPage } from "@/components/audit/audit-viewer";

export default function AuditPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <AuditViewerPage />
      </AppShell>
    </ProtectedRoute>
  );
}
