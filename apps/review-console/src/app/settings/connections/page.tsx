"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  OrgConnectionStatus,
  OrgRole,
  type ConnectionDto,
} from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/auth-guards";
import {
  acceptConnection,
  listConnections,
  rejectConnection,
  requestConnection,
  revokeConnection,
} from "@/lib/connections-api";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    ACCEPTED: "bg-green-100 text-green-800",
    REJECTED: "bg-gray-100 text-gray-700",
    REVOKED: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}
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
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">
          Org connections
        </h1>
        <p className="text-sm text-muted">
          Only organization admins can manage partner connections.
        </p>
      </div>
    );
  }

  if (loading) {
    return <p className="text-muted">Loading connections…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Org connections
        </h1>
        <p className="mt-1 text-sm text-muted">
          Connect partner organizations to share individual pull requests.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/settings/shares" className="text-brand-600 underline">
            Inbound / outbound shares
          </Link>
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}

      <form
        onSubmit={(event) => void onRequest(event)}
        className="space-y-3 rounded-lg border border-border bg-surface p-6"
      >
        <h2 className="text-lg font-medium text-foreground">
          Request connection
        </h2>
        <div>
          <label
            htmlFor="partner-slug"
            className="mb-1 block text-sm text-muted"
          >
            Partner org slug
          </label>
          <input
            id="partner-slug"
            type="text"
            required
            value={partnerOrgSlug}
            onChange={(event) => setPartnerOrgSlug(event.target.value)}
            placeholder="acme"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
      </form>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-foreground">Connections</h2>
        {connections.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No connections yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {connection.partnerOrg.orgName}
                  </p>
                  <p className="text-sm text-muted">
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
                        disabled={busy}
                        onClick={() => void onAccept(connection.id)}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
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
                      variant="secondary"
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
  );
}

export default function ConnectionsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <ConnectionsContent />
      </AppShell>
    </ProtectedRoute>
  );
}
