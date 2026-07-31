"use client";

import { OrgSwitcher, useAuth } from "@unified/auth-client/react";
import { ARGUS_MARK_SRC } from "@unified/ui";
import {
  ChevronDown,
  ExternalLink,
  GitPullRequest,
  Link2,
  Menu,
  ScrollText,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { canMutatePrs, canViewAudit } from "@/lib/roles";
import { NotificationBellContainer } from "@/components/notification-bell-container";

/** Identity mark already includes NEXT_PUBLIC_BASE_PATH — don't let next/image prefix again. */
function argusMarkLoader({ src }: { src: string }) {
  return src;
}

function NavLink({
  href,
  children,
  active,
  icon: Icon,
}: {
  href: string;
  children: ReactNode;
  active: boolean;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 font-sans text-sm font-medium transition-all duration-200 ${
        active
          ? "border-brand-100/60 bg-[linear-gradient(110deg,#fff6fa,#f8e9ef)] text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]"
          : "border-transparent text-[#514c49] hover:bg-white/70 hover:text-foreground"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
      {children}
    </Link>
  );
}

function initialsFromEmail(email?: string): string {
  const parts = email?.split("@")[0]?.split(/[._-]+/).filter(Boolean) ?? [];
  if (parts.length > 1) return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || "AR").toUpperCase();
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, activeOrg, logout, logoutEverywhere } = useAuth();
  const pathname = usePathname();
  const showPrs = canMutatePrs(activeOrg?.role);
  const showAudit = canViewAudit(activeOrg?.role);

  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent">
      <div className="argus-rings argus-rings-bottom" aria-hidden="true" />
      <div className="argus-rings argus-rings-top" aria-hidden="true" />
      <div className="argus-dots" aria-hidden="true" />

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[272px] flex-col border-r border-[#e9e3de] bg-[linear-gradient(180deg,rgba(255,253,251,.97),rgba(252,248,245,.94))] px-5 py-7 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <Image
            src={ARGUS_MARK_SRC}
            alt=""
            width={36}
            height={36}
            unoptimized
            loader={argusMarkLoader}
          />
          <span className="font-serif text-[22px] font-bold tracking-[-0.03em] text-foreground">Argus</span>
        </Link>
        <nav className="mt-12 space-y-2">
          <NavLink href="/" active={pathname === "/"} icon={ScrollText}>Review Console</NavLink>
          {showPrs ? <NavLink href="/prs" active={pathname.startsWith("/prs")} icon={GitPullRequest}>Pull requests</NavLink> : null}
          <NavLink href="/shared/prs" active={pathname.startsWith("/shared")} icon={UsersRound}>Shared with me</NavLink>
          {showAudit ? <NavLink href="/audit" active={pathname.startsWith("/audit")} icon={ScrollText}>Audit log</NavLink> : null}
          <NavLink href="/settings/connections" active={pathname.startsWith("/settings/connections")} icon={Link2}>Connections</NavLink>
        </nav>
        {process.env.NEXT_PUBLIC_SUPPORT_HUB_URL ? (
          <div className="mt-8 border-t border-[#e9e3de] pt-7">
            <a href={process.env.NEXT_PUBLIC_SUPPORT_HUB_URL} className="group flex items-center justify-between px-2 font-sans text-sm font-medium text-brand-600 hover:text-brand-700">
              Open Support Hub
              <ExternalLink className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </aside>

      <header className="relative z-30 flex h-[82px] items-center justify-between border-b border-[#eee9e5]/70 px-5 lg:ml-[272px] lg:justify-end lg:border-0 lg:px-9">
        <Link href="/" className="flex items-center gap-2.5 lg:hidden">
          <Image
            src={ARGUS_MARK_SRC}
            alt=""
            width={32}
            height={32}
            unoptimized
            loader={argusMarkLoader}
          />
          <span className="font-serif text-xl font-bold">Argus</span>
        </Link>
        <div className="flex items-center gap-4">
          <details className="group relative lg:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-white text-foreground hover:bg-surface-muted [&::-webkit-details-marker]:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </summary>
            <nav className="argus-card absolute right-0 mt-3 w-64 rounded-2xl p-2">
              <NavLink href="/" active={pathname === "/"} icon={ScrollText}>Review Console</NavLink>
              {showPrs ? <NavLink href="/prs" active={pathname.startsWith("/prs")} icon={GitPullRequest}>Pull requests</NavLink> : null}
              <NavLink href="/shared/prs" active={pathname.startsWith("/shared")} icon={UsersRound}>Shared with me</NavLink>
              {showAudit ? <NavLink href="/audit" active={pathname.startsWith("/audit")} icon={ScrollText}>Audit log</NavLink> : null}
              <NavLink href="/settings/connections" active={pathname.startsWith("/settings/connections")} icon={Link2}>Connections</NavLink>
            </nav>
          </details>
          <NotificationBellContainer />
          <details className="group relative">
            <summary
              className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
              data-testid="user-menu-trigger"
              aria-label="Open user menu"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 font-sans text-xs font-semibold text-brand-700 ring-1 ring-brand-100">{initialsFromEmail(user?.email)}</span>
              <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="argus-card absolute right-0 mt-3 w-56 overflow-hidden rounded-2xl p-2">
              <p className="truncate border-b border-border px-3 py-2.5 font-sans text-xs text-muted">{user?.email}</p>
              <button type="button" data-testid="logout" onClick={() => void logout()} className="mt-1 w-full rounded-xl px-3 py-2 text-left font-sans text-sm hover:bg-surface-muted">Sign out</button>
              <button type="button" data-testid="logout-everywhere" onClick={() => void logoutEverywhere()} className="w-full rounded-xl px-3 py-2 text-left font-sans text-sm text-muted hover:bg-surface-muted hover:text-foreground">Sign out everywhere</button>
            </div>
          </details>
        </div>
      </header>

      <main className="relative z-10 px-5 pb-12 pt-8 sm:px-8 lg:ml-[272px] lg:px-10 lg:pb-16 xl:px-14">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-7 flex justify-end">
            <OrgSwitcher className="argus-org-select max-w-[220px] rounded-xl border border-[#e6e0db] bg-white px-3.5 py-2.5 font-sans text-xs font-semibold text-foreground outline-none hover:border-brand-200 focus:border-brand-400" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
