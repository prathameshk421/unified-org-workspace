"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  OrgConnectionStatus,
  OrgRole,
  type ConnectionDto,
} from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { AppShell } from "../../../components/app-shell";
import { ProtectedRoute } from "../../../components/auth-guards";
import {
  acceptConnection,
  listConnections,
  rejectConnection,
  requestConnection,
  revokeConnection,
} from "../../../lib/connections-api";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-surface-muted text-foreground",
    ACCEPTED: "bg-brand-50 text-brand-700",
    REJECTED: "bg-surface-muted text-muted",
    REVOKED: "bg-brand-100 text-brand-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 font-sans text-xs font-medium ${colors[status] ?? "bg-surface-muted text-muted"}`}
    >
      {status}
    </span>
  );
}

function ConnectionsContent() {
  const { activeOrg } = useAuth();
  const isOrgAdmin = activeOrg?.role === OrgRole.ORG_ADMIN;
  const [connections, setConnections] = useState<ConnectionDto[]>([]);
  const [partnerOrgSlug, setPartnerOrgSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const data = await listConnections();
    setConnections(data.connections);
  }

  useEffect(() => {
    if (!isOrgAdmin) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load connections",
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
  }, [isOrgAdmin, activeOrg?.orgId]);

  async function onRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOrgAdmin || !partnerOrgSlug.trim()) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await requestConnection(partnerOrgSlug.trim());
      setPartnerOrgSlug("");
      setMessage("Connection request sent.");
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to request connection",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onAccept(id: string) {
    setBusy(true);
    setError(null);
    try {
      await acceptConnection(id);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to accept connection",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onReject(id: string) {
    setBusy(true);
    setError(null);
    try {
      await rejectConnection(id);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reject connection",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (
      !window.confirm(
        "Revoke this connection? All active shares with this partner will be revoked.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await revokeConnection(id);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to revoke connection",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!isOrgAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
            Org connections
          </h1>
          <p className="mt-4 font-sans text-sm text-muted">
            Only organization admins can manage partner connections.
          </p>
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <p className="font-sans text-muted">Loading connections…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          Org connections
        </h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Connect partner organizations to share individual tickets.{" "}
          {activeOrg?.orgName ?? "Active organization"}
        </p>

        {error ? (
          <p className="mt-4 font-sans text-sm text-brand-700">{error}</p>
        ) : null}
        {message ? (
          <p className="mt-4 font-sans text-sm text-brand-600">{message}</p>
        ) : null}

        <form
          onSubmit={(event) => void onRequest(event)}
          className="mt-8 space-y-4 border-t border-border pt-8"
        >
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Request connection
          </h2>
          <div>
            <label
              htmlFor="partner-slug"
              className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
            >
              Partner org slug
            </label>
            <input
              id="partner-slug"
              type="text"
              required
              value={partnerOrgSlug}
              onChange={(event) => setPartnerOrgSlug(event.target.value)}
              placeholder="globex"
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </Button>
        </form>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Connections
          </h2>
          {connections.length === 0 ? (
            <p className="mt-3 font-sans text-sm text-muted">
              No connections yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="font-serif font-semibold text-foreground">
                      {connection.partnerOrg.orgName}
                    </p>
                    <p className="mt-0.5 font-sans text-sm text-muted">
                      @{connection.partnerOrg.orgSlug} · {connection.direction}
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={connection.status} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {connection.status === OrgConnectionStatus.PENDING &&
                    connection.direction === "incoming" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => void onAccept(connection.id)}
                        >
                          Accept
                        </Button>
                        <Button
                          type="button"
                          variant="tertiary"
                          size="sm"
                          disabled={busy}
                          onClick={() => void onReject(connection.id)}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {connection.status === OrgConnectionStatus.ACCEPTED ||
                    connection.status === OrgConnectionStatus.PENDING ? (
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void onRevoke(connection.id)}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

export default function ConnectionsPage() {
  return (
    <ProtectedRoute>
      <ConnectionsContent />
    </ProtectedRoute>
  );
}
