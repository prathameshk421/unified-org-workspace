"use client";

import { OrgSwitcher, useAuth } from "@unified/auth-client/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { canMutatePrs, canViewAudit } from "@/lib/roles";

function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-brand-600 text-white" : "text-foreground hover:bg-surface-muted"
      }`}
    >
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, activeOrg } = useAuth();
  const pathname = usePathname();
  const showPrs = canMutatePrs(activeOrg?.role);
  const showAudit = canViewAudit(activeOrg?.role);

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="text-sm font-semibold text-brand-600">
              Review Console
            </Link>
            <nav className="flex flex-wrap items-center gap-1">
              {showPrs ? (
                <NavLink href="/prs" active={pathname.startsWith("/prs")}>
                  Pull requests
                </NavLink>
              ) : null}
              {showAudit ? (
                <NavLink href="/audit" active={pathname.startsWith("/audit")}>
                  Audit log
                </NavLink>
              ) : null}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">{user?.email}</span>
            <OrgSwitcher className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
