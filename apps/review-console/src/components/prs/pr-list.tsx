"use client";

import { AuthError } from "@unified/auth-client";
import { useAuth } from "@unified/auth-client/react";
import type { PullRequestSummary } from "@unified/types";
import { Button } from "@unified/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ForbiddenMessage } from "@/components/forbidden-message";
import { apiFetch } from "@/lib/api";
import { PrStatusBadge } from "./pr-status-badge";

export function PrListPage() {
  const { activeOrg } = useAuth();
  const [prs, setPrs] = useState<PullRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const data = await apiFetch<PullRequestSummary[]>("/prs");
      setPrs(data);
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        setForbidden(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load pull requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, activeOrg?.orgId]);

  if (loading) {
    return <p className="text-muted">Loading pull requests…</p>;
  }

  if (forbidden) {
    return (
      <ForbiddenMessage message="Support agents cannot access pull requests. Switch to an organization where you have reviewer or admin access, or contact your administrator." />
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-red-700">{error}</p>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Pull requests</h1>
          <p className="mt-1 text-sm text-muted">
            Review and manage pull requests for your active organization.
          </p>
        </div>
        <Link href="/prs/new">
          <Button type="button" data-testid="new-pr-button">
            New pull request
          </Button>
        </Link>
      </div>

      {prs.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-muted">No pull requests yet.</p>
          <Link href="/prs/new" className="mt-4 inline-block text-sm text-brand-600 underline">
            Create the first pull request
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {prs.map((pr) => (
            <li key={pr.id}>
              <Link
                href={`/prs/${pr.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-surface-muted"
                data-testid={`pr-row-${pr.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{pr.title}</p>
                  <p className="mt-1 truncate text-sm text-muted">
                    {pr.description || "No description"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                  <PrStatusBadge status={pr.status} />
                  <span>v{pr.currentVersion}</span>
                  <span>{new Date(pr.updatedAt).toLocaleDateString()}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
