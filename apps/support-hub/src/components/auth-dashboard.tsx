"use client";

import { OrgSwitcher, useAuth } from "@unified/auth-client/react";
import type { TicketResponse } from "@unified/types";
import { ARGUS_MARK_SRC } from "@unified/ui";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ExternalLink,
  Headphones,
  Link2,
  Menu,
  Settings,
  ShieldCheck,
  Ticket,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listTickets } from "../lib/tickets-api";
import { NotificationBellContainer } from "./notification-bell-container";

const quickActions = [
  {
    href: "/tickets",
    title: "Tickets",
    description: "View, create and manage tickets.",
    icon: Ticket,
    testId: "tickets-link",
  },
  {
    href: "/shared/tickets",
    title: "Shared with me",
    description: "Files and tickets shared with you.",
    icon: UsersRound,
    testId: "shared-tickets-link",
  },
  {
    href: "/settings/connections",
    title: "Connections",
    description: "Manage integrations and connections.",
    icon: Link2,
    testId: "connections-link",
  },
  {
    href: "/settings",
    title: "Organization settings",
    description: "Manage members, roles and policies.",
    icon: Settings,
    testId: "settings-link",
  },
] as const;

function initialsFromEmail(email?: string): string {
  const parts = email?.split("@")[0]?.split(/[._-]+/).filter(Boolean) ?? [];
  if (parts.length > 1) return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || "AR").toUpperCase();
}

function relativeTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusStyle(status: string): string {
  if (status === "IN_PROGRESS") return "bg-[#fae9f2] text-[#92204f]";
  if (status === "OPEN") return "bg-[#fff4da] text-[#8a6220]";
  if (status === "RESOLVED") return "bg-[#e8f6eb] text-[#31744a]";
  return "bg-[#f1efed] text-[#67615d]";
}

export function AuthDashboard({
  title,
  siblingLabel,
  siblingUrl,
}: {
  title: string;
  siblingLabel: string;
  siblingUrl?: string;
}) {
  const { user, activeOrg, logout, logoutEverywhere } = useAuth();
  const [recentTickets, setRecentTickets] = useState<TicketResponse[]>([]);
  const initials = initialsFromEmail(user?.email);

  useEffect(() => {
    let cancelled = false;
    void listTickets()
      .then(({ tickets }) => {
        if (!cancelled) {
          setRecentTickets(
            [...tickets]
              .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
              .slice(0, 3),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setRecentTickets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrg?.orgId]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent">
      <div className="argus-rings argus-rings-bottom" aria-hidden="true" />
      <div className="argus-rings argus-rings-top" aria-hidden="true" />
      <div className="argus-dots" aria-hidden="true" />
      <div className="fixed bottom-[8.5rem] left-10 z-0 hidden h-12 w-12 items-center justify-center rounded-full border border-brand-100 bg-white/70 text-brand-600 shadow-sm lg:flex">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="fixed right-20 top-36 z-0 hidden h-12 w-12 items-center justify-center rounded-full border border-brand-100 bg-white/70 text-brand-600 shadow-sm xl:flex">
        <UsersRound className="h-5 w-5" aria-hidden="true" />
      </div>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[272px] flex-col border-r border-[#e9e3de] bg-[linear-gradient(180deg,rgba(255,253,251,.97),rgba(252,248,245,.94))] px-5 py-7 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <img src={ARGUS_MARK_SRC} alt="" width={36} height={36} />
          <span className="font-serif text-[22px] font-bold tracking-[-0.03em] text-foreground">
            Argus
          </span>
        </Link>

        <nav className="mt-12 space-y-2 font-sans text-sm font-medium">
          <Link
            href="/"
            aria-current="page"
            className="flex items-center gap-3 rounded-2xl border border-brand-100/60 bg-[linear-gradient(110deg,#fff6fa,#f8e9ef)] px-4 py-3.5 text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]"
          >
            <Headphones className="h-[18px] w-[18px]" aria-hidden="true" />
            Support Hub
          </Link>
          <SidebarLink href="/tickets" icon={Ticket}>Tickets</SidebarLink>
          <SidebarLink href="/shared/tickets" icon={UsersRound}>Shared with me</SidebarLink>
          <SidebarLink href="/settings/connections" icon={Link2}>Connections</SidebarLink>
          <SidebarLink href="/settings" icon={Settings}>Organization settings</SidebarLink>
        </nav>

        {siblingUrl ? (
          <div className="mt-8 border-t border-[#e9e3de] pt-7">
            <a
              className="group flex items-center justify-between px-2 font-sans text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
              href={siblingUrl}
              data-testid="sibling-dashboard-link"
            >
              Open {siblingLabel}
              <ExternalLink className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </aside>

      <header className="relative z-30 flex h-[82px] items-center justify-between border-b border-[#eee9e5]/70 px-5 lg:ml-[272px] lg:justify-end lg:border-0 lg:px-9">
        <Link href="/" className="flex items-center gap-2.5 lg:hidden">
          <img src={ARGUS_MARK_SRC} alt="" width={32} height={32} />
          <span className="font-serif text-xl font-bold">Argus</span>
        </Link>
        <div className="flex items-center gap-4">
          <details className="group relative lg:hidden">
            <summary
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-white text-foreground transition-colors hover:bg-surface-muted [&::-webkit-details-marker]:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </summary>
            <nav className="argus-card absolute right-0 mt-3 w-64 rounded-2xl p-2 font-sans">
              <MobileNavLink href="/" icon={Headphones}>Support Hub</MobileNavLink>
              <MobileNavLink href="/tickets" icon={Ticket}>Tickets</MobileNavLink>
              <MobileNavLink href="/shared/tickets" icon={UsersRound}>Shared with me</MobileNavLink>
              <MobileNavLink href="/settings/connections" icon={Link2}>Connections</MobileNavLink>
              <MobileNavLink href="/settings" icon={Settings}>Organization settings</MobileNavLink>
            </nav>
          </details>
          <NotificationBellContainer />
          <details className="group relative">
            <summary
              className="flex cursor-pointer list-none items-center gap-2 rounded-full outline-none [&::-webkit-details-marker]:hidden"
              data-testid="user-menu-trigger"
              aria-label="Open user menu"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 font-sans text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                {initials}
              </span>
              <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="argus-card absolute right-0 mt-3 w-56 overflow-hidden rounded-2xl p-2">
              <p className="truncate border-b border-border px-3 py-2.5 font-sans text-xs text-muted">
                {user?.email}
              </p>
              <button
                type="button"
                data-testid="logout"
                onClick={() => void logout()}
                className="mt-1 w-full rounded-xl px-3 py-2 text-left font-sans text-sm text-foreground transition-colors hover:bg-surface-muted"
              >
                Sign out
              </button>
              <button
                type="button"
                data-testid="logout-everywhere"
                onClick={() => void logoutEverywhere()}
                className="w-full rounded-xl px-3 py-2 text-left font-sans text-sm text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                Sign out everywhere
              </button>
            </div>
          </details>
        </div>
      </header>

      <main className="relative z-10 px-5 pb-12 pt-8 sm:px-8 lg:ml-[272px] lg:px-10 lg:pb-16 xl:px-14">
        <div className="mx-auto max-w-[1280px]">
          <div className="border-b border-[#e8e2dd] pb-7">
            <h1 className="font-serif text-4xl font-bold tracking-[-0.035em] text-foreground sm:text-[46px]">
              {title}
            </h1>
          </div>

          <section className="mt-7 grid gap-4 xl:grid-cols-2">
            <div className="argus-card flex min-h-[142px] items-center gap-5 rounded-[20px] p-6 sm:p-7">
              <span className="argus-icon h-14 w-14 rounded-2xl">
                <UserRound className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.11em] text-muted">
                  Signed in as
                </p>
                <p className="mt-2 truncate font-sans text-sm font-semibold text-foreground sm:text-base" data-testid="auth-status">
                  {user?.email}
                </p>
                <p className="mt-2 flex items-center gap-2 font-sans text-xs text-muted">
                  <span className="h-2 w-2 rounded-full bg-[#55b879]" />
                  Authenticated via Shared Identity
                </p>
              </div>
            </div>

            <div className="argus-card flex min-h-[142px] flex-col gap-5 rounded-[20px] p-6 sm:flex-row sm:items-center sm:p-7">
              <span className="argus-icon h-14 w-14 rounded-2xl">
                <Building2 className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.11em] text-muted">
                  Active organization
                </p>
                <p className="mt-2 truncate font-sans text-base font-semibold text-foreground" data-testid="active-org">
                  {activeOrg?.orgName ?? activeOrg?.orgId ?? "None"}
                </p>
                <p className="mt-1 font-sans text-xs text-muted">Current workspace</p>
              </div>
              <OrgSwitcher className="argus-org-select max-w-full rounded-xl border border-[#e6e0db] bg-white px-3.5 py-2.5 font-sans text-xs font-semibold text-foreground outline-none transition-colors hover:border-brand-200 focus:border-brand-400 sm:max-w-[190px]" />
            </div>
          </section>

          <section className="argus-card mt-5 rounded-[20px] p-4 sm:p-5">
            <h2 className="px-1 pb-4 font-sans text-sm font-semibold text-foreground">Quick actions</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    data-testid={action.testId}
                    className="group flex min-h-[104px] items-center gap-3 rounded-2xl border border-[#ece7e2] bg-white px-4 py-4 shadow-[0_5px_18px_rgba(68,45,37,.025)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_10px_25px_rgba(92,26,55,.07)]"
                  >
                    <span className="argus-icon h-11 w-11 rounded-xl">
                      <Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-sans text-xs font-semibold text-foreground">{action.title}</span>
                      <span className="mt-1 block font-sans text-[11px] leading-4 text-muted">{action.description}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 flex-none text-brand-500 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="argus-card mt-5 rounded-[20px] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4 px-1 pb-3">
              <h2 className="font-sans text-sm font-semibold text-foreground">Recent activity</h2>
              <Link
                href="/tickets"
                className="group inline-flex items-center gap-2 rounded-xl border border-[#ece7e2] bg-white px-3.5 py-2 font-sans text-xs font-semibold text-foreground transition-colors hover:border-brand-200"
              >
                View all tickets
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
            {recentTickets.length > 0 ? (
              <ul className="divide-y divide-[#eee9e5]">
                {recentTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link href={`/tickets/${ticket.id}`} className="group flex items-center gap-4 rounded-xl px-1 py-4 transition-colors hover:bg-[#fdf9f7] sm:px-2">
                      <span className="argus-icon h-10 w-10 rounded-xl">
                        <Ticket className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-sans text-sm font-semibold text-foreground">
                          Ticket {ticket.id.slice(0, 8).toUpperCase()} updated
                        </span>
                        <span className="mt-1 block truncate font-sans text-xs text-muted">{ticket.title}</span>
                      </span>
                      <span className={`hidden rounded-full px-3 py-1 font-sans text-[10px] font-semibold sm:inline-flex ${statusStyle(ticket.status)}`}>
                        {ticket.status.replaceAll("_", " ").toLowerCase()}
                      </span>
                      <span className="w-14 flex-none text-right font-sans text-[11px] text-muted">
                        {relativeTime(ticket.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center border-t border-[#eee9e5] text-center">
                <Ticket className="h-6 w-6 text-brand-300" aria-hidden="true" />
                <p className="mt-2 font-sans text-sm font-medium text-foreground">No recent ticket activity</p>
                <p className="mt-1 font-sans text-xs text-muted">Updates in this workspace will appear here.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Ticket;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-[#514c49] transition-all hover:bg-white/70 hover:text-foreground"
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Ticket;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#514c49] transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
      {children}
    </Link>
  );
}
