import { ProtectedRoute } from "../components/auth-guards";
import { AuthDashboard } from "../components/auth-dashboard";

export default function HomePage() {
  return (
    <ProtectedRoute>
      <AuthDashboard
        title="Review & Audit Console"
        siblingLabel="Support Hub"
        siblingUrl={process.env.NEXT_PUBLIC_SUPPORT_HUB_URL}
      />
    </ProtectedRoute>
  );
}
