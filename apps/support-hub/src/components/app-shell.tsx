"use client";

import { OrgSwitcher, useAuth } from "@unified/auth-client/react";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { OrgRole } from "@unified/types";
import { NotificationBellContainer } from "@/components/notification-bell-container";

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
      className={`rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors duration-200 ${
        active
          ? "bg-surface-muted text-foreground"
          : "text-muted hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, activeOrg } = useAuth();
  const pathname = usePathname();
  const isOrgAdmin = activeOrg?.role === OrgRole.ORG_ADMIN;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-serif text-base font-semibold text-foreground transition-opacity duration-200 hover:opacity-80"
            >
              <Ticket className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Support Hub
            </Link>
            <nav className="flex flex-wrap items-center gap-0.5">
              <NavLink href="/tickets" active={pathname.startsWith("/tickets")}>
                Tickets
              </NavLink>
              <NavLink
                href="/shared/tickets"
                active={pathname.startsWith("/shared")}
              >
                Shared with me
              </NavLink>
              <NavLink
                href="/settings"
                active={pathname === "/settings"}
              >
                Settings
              </NavLink>
              {isOrgAdmin ? (
                <>
                  <NavLink
                    href="/settings/connections"
                    active={pathname.startsWith("/settings/connections")}
                  >
                    Connections
                  </NavLink>
                  <NavLink
                    href="/settings/shares"
                    active={pathname.startsWith("/settings/shares")}
                  >
                    Shares
                  </NavLink>
                </>
              ) : null}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-sans text-sm">
            <NotificationBellContainer />
            <span className="text-muted">{user?.email}</span>
            <OrgSwitcher className="rounded-full border border-border bg-surface-raised px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-surface-muted" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
