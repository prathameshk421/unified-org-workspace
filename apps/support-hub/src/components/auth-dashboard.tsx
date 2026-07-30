"use client";

import { OrgSwitcher, useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { ArrowRight, Ticket } from "lucide-react";
import Link from "next/link";
import { NotificationBellContainer } from "./notification-bell-container";

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

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-16">
      <div className="absolute right-6 top-6">
        <NotificationBellContainer />
      </div>
      <div className="w-full max-w-lg text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 font-sans text-xs font-medium text-muted">
          <Ticket className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
          Unified Org Workspace
        </div>
        <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-md font-serif text-base text-muted">{subtitle}</p>

        <div className="mt-10 space-y-3 border-y border-border py-8 text-left">
          <p className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
            Signed in as
          </p>
          <p className="font-serif text-lg font-semibold text-foreground" data-testid="auth-status">
            {user?.email}
          </p>
          <p className="pt-3 font-sans text-xs font-medium uppercase tracking-wider text-muted">
            Active organization
          </p>
          <p className="font-serif font-medium text-foreground" data-testid="active-org">
            {activeOrg?.orgName ?? activeOrg?.orgId ?? "None"}
          </p>
          <div className="pt-4">
            <label className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted">
              Organization
            </label>
            <OrgSwitcher className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm transition-colors duration-200" />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/tickets">
            <Button type="button" data-testid="tickets-link">
              Tickets
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
          <Link href="/shared/tickets">
            <Button type="button" variant="tertiary" data-testid="shared-tickets-link">
              Shared with me
            </Button>
          </Link>
          <Link href="/settings">
            <Button type="button" variant="tertiary" data-testid="settings-link">
              Organization settings
            </Button>
          </Link>
          <Link href="/settings/connections">
            <Button type="button" variant="tertiary" data-testid="connections-link">
              Connections
            </Button>
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="secondary" size="sm" data-testid="logout" onClick={() => void logout()}>
            Sign out
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            data-testid="logout-everywhere"
            onClick={() => void logoutEverywhere()}
          >
            Sign out everywhere
          </Button>
        </div>

        {siblingUrl ? (
          <p className="mt-8 font-sans text-sm text-muted">
            <a
              className="text-brand-600 transition-colors duration-200 hover:text-brand-700"
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
