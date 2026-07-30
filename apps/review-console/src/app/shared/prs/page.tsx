"use client";

import { useEffect, useState } from "react";
import type { PullRequestSummary } from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { GitPullRequest } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/auth-guards";
import { PrStatusBadge } from "@/components/prs/pr-status-badge";
import { listSharedPrs } from "@/lib/shares-api";

function SharedPrsContent() {
  const { activeOrg } = useAuth();
  const [prs, setPrs] = useState<PullRequestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listSharedPrs();
        if (!cancelled) {
          setPrs(data.prs);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load shared PRs",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeOrg?.orgId]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          Shared with me
        </h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Pull requests shared into {activeOrg?.orgName ?? "your organization"}.
          View and comment only.
        </p>
      </div>

      {loading ? (
        <p className="font-sans text-muted">Loading shared pull requests…</p>
      ) : error ? (
        <p className="font-sans text-brand-700">{error}</p>
      ) : prs.length === 0 ? (
        <div className="border-y border-border py-12 text-center">
          <GitPullRequest className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-3 font-serif text-muted">
            No pull requests shared with you in this organization.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {prs.map((pr) => (
            <li key={pr.id}>
              <Link
                href={`/prs/${pr.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-1 py-4 transition-colors duration-200 hover:bg-surface-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-serif font-semibold text-foreground">{pr.title}</p>
                  {pr.sharedFromOrg ? (
                    <p className="mt-1 font-sans text-xs font-medium text-brand-600">
                      Shared from {pr.sharedFromOrg.orgName}
                    </p>
                  ) : null}
                  <p className="mt-1 line-clamp-2 font-serif text-sm text-muted">
                    {pr.description || "No description"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-sans text-sm text-muted">
                  <PrStatusBadge status={pr.status} />
                  <span>v{pr.currentVersion}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SharedPrsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <SharedPrsContent />
      </AppShell>
    </ProtectedRoute>
  );
}
