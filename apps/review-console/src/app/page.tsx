import type { AppMetadata } from "@unified/types";
import { Button } from "@unified/ui";

const metadata: AppMetadata = {
  name: "review-console",
  version: "0.0.0",
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-muted px-6">
      <div className="max-w-lg text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
          Unified Org Workspace
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-foreground">
          Review &amp; Audit Console
        </h1>
        <p className="mt-3 text-muted">
          Dashboard 2 placeholder — PR workflow and audit viewer land in Tier 2 branches.
        </p>
        <p className="mt-2 text-sm text-muted">
          Package: {metadata.name} v{metadata.version}
        </p>
      </div>
      <Button type="button" variant="secondary">
        Shared UI Component
      </Button>
    </main>
  );
}
