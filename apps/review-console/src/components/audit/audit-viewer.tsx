"use client";

import { AuthError } from "@unified/auth-client";
import { useAuth } from "@unified/auth-client/react";
import { AuditAction } from "@unified/types";
import { Button, DateRangePicker, Dialog } from "@unified/ui";
import { ScrollText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ForbiddenMessage } from "@/components/forbidden-message";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import type { AuditListResponse, OrgMember } from "@/lib/types";

const AUDIT_ACTION_OPTIONS = Object.values(AuditAction);

const inputClassName =
  "w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm text-foreground transition-colors duration-200 focus:border-brand-600 focus:outline-none";

const labelClassName =
  "mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted";

interface AuditFilters {
  userId: string;
  userQuery: string;
  action: string;
  from: string;
  to: string;
}

function buildQuery(filters: AuditFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.userId.trim()) params.set("userId", filters.userId.trim());
  if (filters.userQuery.trim()) params.set("userQuery", filters.userQuery.trim());
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59.999`).toISOString());
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
    userQuery: "",
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
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [exportDialog, setExportDialog] = useState<string | null>(null);

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

  useEffect(() => {
    void apiFetch<OrgMember[]>("/org/members")
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [activeOrg?.orgId]);

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
        setExportDialog(err instanceof Error ? err.message : "Export failed");
      }
    } finally {
      setExporting(false);
    }
  }

  const activeChips = [
    appliedFilters.userQuery && `User: ${appliedFilters.userQuery}`,
    appliedFilters.action && `Action: ${appliedFilters.action}`,
    appliedFilters.from && `From: ${appliedFilters.from}`,
    appliedFilters.to && `To: ${appliedFilters.to}`,
  ].filter(Boolean);

  if (forbidden) {
    return (
      <ForbiddenMessage message="Support agents cannot view the audit log. Switch to an organization where you have reviewer or admin access." />
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
            Audit log
          </h1>
          <p className="mt-1 font-sans text-sm text-muted">
            Activity for your active organization only.
          </p>
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
        className="mb-4 grid gap-4 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <label htmlFor="audit-user" className={labelClassName}>
            User
          </label>
          <input
            id="audit-user"
            type="text"
            list="audit-members"
            value={filters.userQuery}
            onChange={(event) =>
              setFilters((current) => ({ ...current, userQuery: event.target.value, userId: "" }))
            }
            className={inputClassName}
            placeholder="Search name or email"
          />
          <datalist id="audit-members">
            {members.map((member) => (
              <option key={member.id} value={member.email}>
                {member.name}
              </option>
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="audit-action" className={labelClassName}>
            Action
          </label>
          <select
            id="audit-action"
            value={filters.action}
            onChange={(event) =>
              setFilters((current) => ({ ...current, action: event.target.value }))
            }
            className={inputClassName}
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
          <p className={labelClassName}>Date range</p>
          <DateRangePicker
            value={{ from: filters.from, to: filters.to }}
            onChange={({ from, to }) => setFilters((current) => ({ ...current, from, to }))}
            id="audit-date-range"
          />
        </div>
        <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
          <Button type="submit" variant="secondary" data-testid="audit-apply-filters">
            Apply filters
          </Button>
          <Button
            type="button"
            variant="tertiary"
            onClick={() => {
              const empty = { userId: "", userQuery: "", action: "", from: "", to: "" };
              setFilters(empty);
              setAppliedFilters(empty);
            }}
          >
            Clear all
          </Button>
        </div>
      </form>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="font-sans text-sm text-muted">
          {activeChips.length ? `${activeChips.length} filters applied` : "No filters applied"}
        </span>
        {activeChips.map((chip) => (
          <span key={chip} className="rounded-full bg-brand-600/10 px-2.5 py-1 font-sans text-xs text-brand-700">
            {chip}
          </span>
        ))}
      </div>

      {error ? <p className="mb-4 font-sans text-sm text-brand-700">{error}</p> : null}

      {loading ? (
        <p className="font-sans text-muted">Loading audit events…</p>
      ) : items.length === 0 ? (
        <div className="border-y border-border py-12 text-center">
          <ScrollText className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-3 font-serif text-muted">No audit events match your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-border">
          <table className="min-w-full divide-y divide-border text-left font-sans text-sm">
            <thead>
              <tr>
                <th className="px-1 py-3 font-sans text-xs font-medium uppercase tracking-wider text-muted">
                  Time
                </th>
                <th className="px-1 py-3 font-sans text-xs font-medium uppercase tracking-wider text-muted">
                  Action
                </th>
                <th className="px-1 py-3 font-sans text-xs font-medium uppercase tracking-wider text-muted">
                  User
                </th>
                <th className="px-1 py-3 font-sans text-xs font-medium uppercase tracking-wider text-muted">
                  Entity
                </th>
                <th className="px-1 py-3 font-sans text-xs font-medium uppercase tracking-wider text-muted">
                  Metadata
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors duration-200 hover:bg-surface-muted/60"
                  data-testid={`audit-row-${row.id}`}
                >
                  <td className="whitespace-nowrap px-1 py-3 text-muted">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-1 py-3 text-foreground">{row.action}</td>
                  <td className="px-1 py-3 text-muted">
                    {row.actor ? (
                      <>
                        <p className="text-foreground">{row.actor.name}</p>
                        <p className="text-xs">{row.actor.email}</p>
                        <p className="mt-1 text-[10px] text-muted">{row.actor.id}</p>
                      </>
                    ) : (
                      row.userId ?? "—"
                    )}
                  </td>
                  <td className="px-1 py-3 text-muted">
                    {row.entityType}:{row.entityId}
                  </td>
                  <td className="max-w-xs truncate px-1 py-3 text-muted">
                    {formatMetadata(row.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor ? (
        <div className="mt-6">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void load(appliedFilters, nextCursor, true)}
            data-testid="audit-load-more"
          >
            Load more
          </Button>
        </div>
      ) : null}
      <Dialog
        open={exportDialog !== null}
        onOpenChange={(open) => !open && setExportDialog(null)}
        title="Export unavailable"
      >
        <p>{exportDialog}</p>
      </Dialog>
    </div>
  );
}
