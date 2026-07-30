"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  OrgConnectionStatus,
  OrgRole,
  type ConnectionDto,
} from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { Link2, Shield } from "lucide-react";
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
    PENDING: "bg-brand-50 text-brand-700",
    ACCEPTED: "bg-brand-100 text-brand-800",
    REJECTED: "bg-surface-muted text-muted",
    REVOKED: "bg-surface-muted text-foreground",
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
      <div className="py-16 text-center">
        <Shield className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
        <h1 className="mt-4 font-serif text-2xl font-semibold text-foreground">
          Org connections
        </h1>
        <p className="mx-auto mt-2 max-w-md font-sans text-sm text-muted">
          Only organization admins can manage partner connections.
        </p>
      </div>
    );
  }

  if (loading) {
    return <p className="font-sans text-muted">Loading connections…</p>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          Org connections
        </h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Connect partner organizations to share individual pull requests.
        </p>
        <p className="mt-2 font-sans text-sm">
          <Link
            href="/settings/shares"
            className="text-brand-600 transition-colors duration-200 hover:text-brand-700"
          >
            Inbound / outbound shares
          </Link>
        </p>
      </div>

      {error ? <p className="mb-4 font-sans text-sm text-brand-700">{error}</p> : null}
      {message ? <p className="mb-4 font-sans text-sm text-brand-700">{message}</p> : null}

      <form
        onSubmit={(event) => void onRequest(event)}
        className="space-y-4 border-t border-border pt-8"
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
            placeholder="acme"
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm text-foreground transition-colors duration-200 focus:border-brand-600 focus:outline-none"
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
      </form>

      <section className="mt-8 border-t border-border pt-8">
        <h2 className="font-serif text-xl font-semibold text-foreground">Connections</h2>
        {connections.length === 0 ? (
          <div className="mt-6 border-y border-border py-12 text-center">
            <Link2 className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 font-serif text-muted">No connections yet.</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-3 px-1 py-4 transition-colors duration-200 hover:bg-surface-muted/60"
              >
                <div>
                  <p className="font-serif font-semibold text-foreground">
                    {connection.partnerOrg.orgName}
                  </p>
                  <p className="mt-1 font-sans text-sm text-muted">
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
