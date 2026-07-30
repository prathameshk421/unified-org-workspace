"use client";

import { OrgSwitcher, useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import Link from "next/link";
import { canMutatePrs, canViewAudit } from "@/lib/roles";

export function AuthDashboard({
  title,
  subtitle,
  siblingLabel,
  siblingUrl,
}: {
  title: string;
  subtitle: string;
  siblingLabel: string;
  siblingUrl?: string;
}) {
  const { user, activeOrg, logout, logoutEverywhere } = useAuth();
  const showPrs = canMutatePrs(activeOrg?.role);
  const showAudit = canViewAudit(activeOrg?.role);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-muted px-6">
      <div className="w-full max-w-lg text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
          Unified Org Workspace
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-muted">{subtitle}</p>

        <div className="mt-8 space-y-3 rounded-lg border border-border bg-surface p-6 text-left">
          <p className="text-sm text-muted">Signed in as</p>
          <p className="text-lg font-medium text-foreground" data-testid="auth-status">
            {user?.email}
          </p>
          <p className="text-sm text-muted">Active organization</p>
          <p className="font-medium text-foreground" data-testid="active-org">
            {activeOrg?.orgName ?? activeOrg?.orgId ?? "None"}
          </p>
          <div className="pt-2">
            <label className="mb-1 block text-sm text-muted">Organization</label>
            <OrgSwitcher className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
          </div>
        </div>

        {showPrs || showAudit ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {showPrs ? (
              <Link href="/prs">
                <Button type="button" variant="secondary" data-testid="nav-prs">
                  Pull requests
                </Button>
              </Link>
            ) : null}
            <Link href="/shared/prs">
              <Button
                type="button"
                variant="secondary"
                data-testid="nav-shared-prs"
              >
                Shared with me
              </Button>
            </Link>
            {showAudit ? (
              <Link href="/audit">
                <Button type="button" variant="secondary" data-testid="nav-audit">
                  Audit log
                </Button>
              </Link>
            ) : null}
            <Link href="/settings/connections">
              <Button
                type="button"
                variant="secondary"
                data-testid="nav-connections"
              >
                Connections
              </Button>
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/shared/prs">
              <Button
                type="button"
                variant="secondary"
                data-testid="nav-shared-prs"
              >
                Shared with me
              </Button>
            </Link>
            <Link href="/settings/connections">
              <Button
                type="button"
                variant="secondary"
                data-testid="nav-connections"
              >
                Connections
              </Button>
            </Link>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" data-testid="logout" onClick={() => void logout()}>
            Sign out
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="logout-everywhere"
            onClick={() => void logoutEverywhere()}
          >
            Sign out everywhere
          </Button>
        </div>

        {siblingUrl ? (
          <p className="mt-6 text-sm text-muted">
            <a
              className="text-brand-600 underline"
              href={siblingUrl}
              data-testid="sibling-dashboard-link"
            >
              Open {siblingLabel}
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}
