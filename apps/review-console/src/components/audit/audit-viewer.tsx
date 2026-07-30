"use client";

import { AuthError } from "@unified/auth-client";
import { useAuth } from "@unified/auth-client/react";
import { AuditAction } from "@unified/types";
import { Button } from "@unified/ui";
import { useCallback, useEffect, useState } from "react";
import { ForbiddenMessage } from "@/components/forbidden-message";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import type { AuditListResponse } from "@/lib/types";

const AUDIT_ACTION_OPTIONS = Object.values(AuditAction);

interface AuditFilters {
  userId: string;
  action: string;
  from: string;
  to: string;
}

function buildQuery(filters: AuditFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.userId.trim()) params.set("userId", filters.userId.trim());
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", new Date(filters.from).toISOString());
  if (filters.to) params.set("to", new Date(filters.to).toISOString());
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function formatMetadata(metadata: Record<string, unknown>): string {
  try {
    return JSON.stringify(metadata);
  } catch {
    return "{}";
  }
}

export function AuditViewerPage() {
  const { activeOrg } = useAuth();
  const [filters, setFilters] = useState<AuditFilters>({
    userId: "",
    action: "",
    from: "",
    to: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(filters);
  const [items, setItems] = useState<AuditListResponse["items"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (activeFilters: AuditFilters, cursor?: string | null, append = false) => {
      setError(null);
      setForbidden(false);

      try {
        const data = await apiFetch<AuditListResponse>(
          `/audit${buildQuery(activeFilters, cursor)}`,
        );
        setItems((current) => (append ? [...current, ...data.items] : data.items));
        setNextCursor(data.nextCursor);
      } catch (err) {
        if (err instanceof AuthError && err.status === 403) {
          setForbidden(true);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load audit log");
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      await load(appliedFilters);
      if (!cancelled) {
        setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [appliedFilters, load, activeOrg?.orgId]);

  function handleApplyFilters(event: React.FormEvent) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);

    try {
      const blob = await apiFetchBlob(`/audit/export${buildQuery(appliedFilters)}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "audit-export.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(err instanceof Error ? err.message : "Export failed");
      }
    } finally {
      setExporting(false);
    }
  }

  if (forbidden) {
    return (
      <ForbiddenMessage message="Support agents cannot view the audit log. Switch to an organization where you have reviewer or admin access." />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Audit log</h1>
          <p className="mt-1 text-sm text-muted">Activity for your active organization only.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={exporting}
          onClick={() => void handleExport()}
          data-testid="audit-export-button"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      <form
        onSubmit={handleApplyFilters}
        className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label htmlFor="audit-user-id" className="mb-1 block text-sm font-medium">
            User ID
          </label>
          <input
            id="audit-user-id"
            type="text"
            value={filters.userId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, userId: event.target.value }))
            }
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            placeholder="Filter by user ID"
          />
        </div>
        <div>
          <label htmlFor="audit-action" className="mb-1 block text-sm font-medium">
            Action
          </label>
          <select
            id="audit-action"
            value={filters.action}
            onChange={(event) =>
              setFilters((current) => ({ ...current, action: event.target.value }))
            }
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">All actions</option>
            {AUDIT_ACTION_OPTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-from" className="mb-1 block text-sm font-medium">
            From
          </label>
          <input
            id="audit-from"
            type="datetime-local"
            value={filters.from}
            onChange={(event) =>
              setFilters((current) => ({ ...current, from: event.target.value }))
            }
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="audit-to" className="mb-1 block text-sm font-medium">
            To
          </label>
          <input
            id="audit-to"
            type="datetime-local"
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" variant="secondary" data-testid="audit-apply-filters">
            Apply filters
          </Button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <p className="text-muted">Loading audit events…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-muted">
          No audit events match your filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="min-w-full divide-y divide-border text-left text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-3 font-medium text-foreground">Time</th>
                <th className="px-4 py-3 font-medium text-foreground">Action</th>
                <th className="px-4 py-3 font-medium text-foreground">User</th>
                <th className="px-4 py-3 font-medium text-foreground">Entity</th>
                <th className="px-4 py-3 font-medium text-foreground">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((row) => (
                <tr key={row.id} data-testid={`audit-row-${row.id}`}>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-foreground">{row.action}</td>
                  <td className="px-4 py-3 text-muted">{row.userId ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {row.entityType}:{row.entityId}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted">
                    {formatMetadata(row.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => void load(appliedFilters, nextCursor, true)}
          data-testid="audit-load-more"
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}
