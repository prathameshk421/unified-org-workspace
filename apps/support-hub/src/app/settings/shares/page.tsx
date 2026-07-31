"use client";

import { useEffect, useState } from "react";
import {
  OrgRole,
  ShareGrantStatus,
  ShareResourceType,
  type ShareGrantDto,
} from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button, ConfirmDialog } from "@unified/ui";
import { AppShell } from "../../../components/app-shell";
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
    <li className="flex flex-wrap items-center justify-between gap-3 px-1 py-4">
      <div>
        <p className="font-serif font-semibold text-foreground">
          {resourceLabel(share)} · {share.resourceId.slice(0, 8)}…
        </p>
        <p className="mt-0.5 font-sans text-sm text-muted">
          Recipient {share.grantedToUserId.slice(0, 8)}… ·{" "}
          {share.status === ShareGrantStatus.ACTIVE ? (
            <span className="inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              Active
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
              Revoked
            </span>
          )}{" "}
          · {new Date(share.createdAt).toLocaleString()}
        </p>
      </div>
      {share.status === ShareGrantStatus.ACTIVE ? (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
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
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
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
    setPendingRevokeId(null);
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
      <AppShell>
        <p className="font-sans text-muted">Loading shares…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          Share grants
        </h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Inbound shares you can access, and outbound shares from your org
          {isOrgAdmin ? " (admin)" : ""}.
        </p>

        {error ? (
          <p className="mt-4 font-sans text-sm text-brand-700">{error}</p>
        ) : null}

        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Inbound
          </h2>
          {inbound.length === 0 ? (
            <p className="mt-3 font-sans text-sm text-muted">
              No inbound shares.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {inbound.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  busy={busy}
                  onRevoke={setPendingRevokeId}
                />
              ))}
            </ul>
          )}
        </section>

        {isOrgAdmin ? (
          <section className="mt-10">
            <h2 className="font-serif text-xl font-semibold text-foreground">
              Outbound
            </h2>
            {outbound.length === 0 ? (
              <p className="mt-3 font-sans text-sm text-muted">
                No outbound shares.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {outbound.map((share) => (
                  <ShareRow
                    key={share.id}
                    share={share}
                    busy={busy}
                    onRevoke={setPendingRevokeId}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <p className="mt-8 font-sans text-sm text-muted">
            Organization admins can also view outbound shares from this org.
          </p>
        )}
      </div>
      <ConfirmDialog
        open={pendingRevokeId !== null}
        onOpenChange={(open) => !open && setPendingRevokeId(null)}
        title="Revoke share?"
        description="The recipient will immediately lose access to this shared item."
        confirmLabel="Revoke share"
        busy={busy}
        onConfirm={() => pendingRevokeId && void onRevoke(pendingRevokeId)}
      />
    </AppShell>
  );
}

export default function SharesAdminPage() {
  return (
    <ProtectedRoute>
      <SharesAdminContent />
    </ProtectedRoute>
  );
}
