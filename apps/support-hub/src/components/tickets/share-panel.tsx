"use client";

import { useEffect, useState } from "react";
import type {
  ConnectionDto,
  ConnectionRecipientDto,
  ShareGrantDto,
} from "@unified/types";
import { OrgConnectionStatus, ShareGrantStatus } from "@unified/types";
import { Button } from "@unified/ui";
import { listConnections, listRecipients } from "../../lib/connections-api";
import {
  createTicketShare,
  listTicketShares,
  revokeShare,
} from "../../lib/shares-api";

export function TicketSharePanel({ ticketId }: { ticketId: string }) {
  const [connections, setConnections] = useState<ConnectionDto[]>([]);
  const [canListConnections, setCanListConnections] = useState(false);
  const [shares, setShares] = useState<ShareGrantDto[]>([]);
  const [canListShares, setCanListShares] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [query, setQuery] = useState("");
  const [recipients, setRecipients] = useState<ConnectionRecipientDto[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accepted = connections.filter(
    (c) => c.status === OrgConnectionStatus.ACCEPTED,
  );
  const activeShares = shares.filter((s) => s.status === ShareGrantStatus.ACTIVE);
  const selectedConnection = accepted.find((c) => c.id === selectedConnectionId);

  async function refreshShares() {
    try {
      const shareData = await listTicketShares(ticketId);
      setShares(shareData.shares);
      setCanListShares(true);
    } catch {
      setShares([]);
      setCanListShares(false);
    }
  }

  async function refreshConnections() {
    try {
      const connData = await listConnections();
      setConnections(connData.connections);
      setCanListConnections(true);
    } catch {
      setConnections([]);
      setCanListConnections(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      await Promise.all([refreshConnections(), refreshShares()]);
      if (!cancelled) {
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    if (!selectedConnectionId) {
      setRecipients([]);
      setSelectedRecipientId("");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await listRecipients(
            selectedConnectionId,
            query || undefined,
          );
          if (!cancelled) {
            setRecipients(data.recipients);
          }
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error ? err.message : "Failed to load recipients",
            );
          }
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedConnectionId, query]);

  async function onShare() {
    if (!selectedConnection || !selectedRecipientId) return;
    setBusy(true);
    setError(null);
    try {
      await createTicketShare(ticketId, {
        recipientUserId: selectedRecipientId,
        partnerOrgSlug: selectedConnection.partnerOrg.orgSlug,
      });
      setSelectedRecipientId("");
      setQuery("");
      await refreshShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(shareId: string) {
    if (!window.confirm("Revoke this share? The recipient will lose access.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await revokeShare(shareId);
      await refreshShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="font-sans text-sm text-muted">Loading shares…</p>;
  }

  if (!canListShares && !canListConnections) {
    return null;
  }

  return (
    <section className="border-y border-border py-8">
      <h2 className="font-serif text-xl font-semibold text-foreground">
        Share with partner
      </h2>
      <p className="mt-1 font-sans text-sm text-muted">
        Share this ticket with a user in a connected organization. Recipients
        can view and comment only.
      </p>

      {error ? (
        <p className="mt-3 font-sans text-sm text-brand-700">{error}</p>
      ) : null}

      {!canListConnections ? (
        <p className="mt-4 font-sans text-sm text-muted">
          Partner picker needs an accepted org connection list. Ask an org admin
          to connect a partner under Settings → Connections, or ensure you can
          list connections.
        </p>
      ) : accepted.length === 0 ? (
        <p className="mt-4 font-sans text-sm text-muted">
          No accepted org connections. Connect a partner org under Settings →
          Connections first.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="share-partner"
              className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
            >
              Partner organization
            </label>
            <select
              id="share-partner"
              value={selectedConnectionId}
              onChange={(event) => {
                setSelectedConnectionId(event.target.value);
                setSelectedRecipientId("");
                setQuery("");
              }}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none"
            >
              <option value="">Select partner…</option>
              {accepted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.partnerOrg.orgName} ({c.partnerOrg.orgSlug})
                </option>
              ))}
            </select>
          </div>

          {selectedConnectionId ? (
            <>
              <div>
                <label
                  htmlFor="share-recipient-query"
                  className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
                >
                  Find recipient
                </label>
                <input
                  id="share-recipient-query"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name…"
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="share-recipient"
                  className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
                >
                  Recipient
                </label>
                <select
                  id="share-recipient"
                  value={selectedRecipientId}
                  onChange={(event) => setSelectedRecipientId(event.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none"
                >
                  <option value="">Select recipient…</option>
                  {recipients.map((r) => (
                    <option key={r.userId} value={r.userId}>
                      {r.name} ({r.initials})
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                disabled={busy || !selectedRecipientId}
                onClick={() => void onShare()}
              >
                {busy ? "Sharing…" : "Share ticket"}
              </Button>
            </>
          ) : null}
        </div>
      )}

      {canListShares ? (
        <div className="mt-8">
          <h3 className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
            Active shares
          </h3>
          {activeShares.length === 0 ? (
            <p className="mt-2 font-sans text-sm text-muted">
              Not shared with anyone yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {activeShares.map((share) => {
                const partner = connections.find(
                  (c) => c.id === share.orgConnectionId,
                );
                return (
                  <li
                    key={share.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-1 py-4"
                  >
                    <div>
                      <p className="font-serif text-sm text-foreground">
                        Recipient {share.grantedToUserId.slice(0, 8)}…
                      </p>
                      <p className="mt-0.5 font-sans text-sm text-muted">
                        {partner?.partnerOrg.orgName ?? "Partner org"} ·{" "}
                        {new Date(share.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void onRevoke(share.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
