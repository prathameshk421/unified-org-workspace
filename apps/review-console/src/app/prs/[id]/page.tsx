import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/auth-guards";
import { PrDetailPage } from "@/components/prs/pr-detail";

export default async function PrDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedRoute>
      <AppShell>
        <PrDetailPage prId={id} />
      </AppShell>
    </ProtectedRoute>
  );
}
