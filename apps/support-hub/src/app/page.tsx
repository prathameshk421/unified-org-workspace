import { ProtectedRoute } from "../components/auth-guards";
import { AuthDashboard } from "../components/auth-dashboard";

export default function HomePage() {
  return (
    <ProtectedRoute>
      <AuthDashboard
        title="Support Hub"
        subtitle="Dashboard 1 — authenticated via shared Identity/Org session."
        siblingLabel="Review & Audit Console"
        siblingUrl={process.env.NEXT_PUBLIC_REVIEW_CONSOLE_URL}
      />
    </ProtectedRoute>
  );
}
