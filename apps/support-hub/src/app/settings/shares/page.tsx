"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  OrgRole,
  ShareGrantStatus,
  ShareResourceType,
  type ShareGrantDto,
} from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { ProtectedRoute } from "../../../components/auth-guards";
import {
  listInboundShares,
  listOutboundShares,
  revokeShare,
} from "../../../lib/shares-api";

function resourceLabel(share: ShareGrantDto): string {
  return share.resourceType === ShareResourceType.TICKET
    ? "Ticket"
    : "Pull request";
}

function ShareRow({
  share,
  busy,
  onRevoke,
}: {
  share: ShareGrantDto;
  busy: boolean;
  onRevoke: (id: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div>
        <p className="font-medium text-foreground">
          {resourceLabel(share)} · {share.resourceId.slice(0, 8)}…
        </p>
        <p className="text-muted">
          Recipient {share.grantedToUserId.slice(0, 8)}… ·{" "}
          {share.status === ShareGrantStatus.ACTIVE ? "Active" : "Revoked"} ·{" "}
          {new Date(share.createdAt).toLocaleString()}
        </p>
      </div>
      {share.status === ShareGrantStatus.ACTIVE ? (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => onRevoke(share.id)}
        >
          Revoke
        </Button>
      ) : null}
    </li>
  );
}

function SharesAdminContent() {
  const { activeOrg } = useAuth();
  const isOrgAdmin = activeOrg?.role === OrgRole.ORG_ADMIN;
  const [inbound, setInbound] = useState<ShareGrantDto[]>([]);
  const [outbound, setOutbound] = useState<ShareGrantDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [inData, outData] = await Promise.all([
      listInboundShares(),
      isOrgAdmin ? listOutboundShares() : Promise.resolve({ shares: [] }),
    ]);
    setInbound(inData.shares);
    setOutbound(outData.shares);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load shares",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.orgId, isOrgAdmin]);

  async function onRevoke(shareId: string) {
    if (!window.confirm("Revoke this share? The recipient will lose access.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await revokeShare(shareId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-muted">
        <p className="text-muted">Loading shares…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-muted px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/settings" className="text-sm text-brand-600 underline">
          ← Settings
        </Link>
        <h1 className="mt-4 text-3xl font-semibold text-foreground">
          Share grants
        </h1>
        <p className="mt-2 text-sm text-muted">
          Inbound shares you can access, and outbound shares from your org
          {isOrgAdmin ? " (admin)" : ""}.
        </p>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <section className="mt-6 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-lg font-medium text-foreground">Inbound</h2>
          {inbound.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No inbound shares.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {inbound.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  busy={busy}
                  onRevoke={(id) => void onRevoke(id)}
                />
              ))}
            </ul>
          )}
        </section>

        {isOrgAdmin ? (
          <section className="mt-6 rounded-lg border border-border bg-surface p-6">
            <h2 className="text-lg font-medium text-foreground">Outbound</h2>
            {outbound.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No outbound shares.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {outbound.map((share) => (
                  <ShareRow
                    key={share.id}
                    share={share}
                    busy={busy}
                    onRevoke={(id) => void onRevoke(id)}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <p className="mt-6 text-sm text-muted">
            Organization admins can also view outbound shares from this org.
          </p>
        )}
      </div>
    </main>
  );
}

export default function SharesAdminPage() {
  return (
    <ProtectedRoute>
      <SharesAdminContent />
    </ProtectedRoute>
  );
}
