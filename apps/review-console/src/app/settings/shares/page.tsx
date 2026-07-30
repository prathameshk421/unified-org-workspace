"use client";

import { useEffect, useState } from "react";
import {
  OrgRole,
  ShareGrantStatus,
  ShareResourceType,
  type ShareGrantDto,
} from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { Share2 } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/auth-guards";
import {
  listInboundShares,
  listOutboundShares,
  revokeShare,
} from "@/lib/shares-api";

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
    <li className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 font-sans text-sm transition-colors duration-200 hover:bg-surface-muted/60">
      <div>
        <p className="font-serif font-semibold text-foreground">
          {resourceLabel(share)} · {share.resourceId.slice(0, 8)}…
        </p>
        <p className="mt-1 text-muted">
          Recipient {share.grantedToUserId.slice(0, 8)}… ·{" "}
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              share.status === ShareGrantStatus.ACTIVE
                ? "bg-brand-100 text-brand-800"
                : "bg-surface-muted text-muted"
            }`}
          >
            {share.status === ShareGrantStatus.ACTIVE ? "Active" : "Revoked"}
          </span>{" "}
          · {new Date(share.createdAt).toLocaleString()}
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
    return <p className="font-sans text-muted">Loading shares…</p>;
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/settings/connections"
          className="font-sans text-sm text-brand-600 transition-colors duration-200 hover:text-brand-700"
        >
          ← Connections
        </Link>
        <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight text-foreground">
          Share grants
        </h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Inbound shares you can access, and outbound shares from your org
          {isOrgAdmin ? " (admin)" : ""}.
        </p>
      </div>

      {error ? <p className="mb-4 font-sans text-sm text-brand-700">{error}</p> : null}

      <section className="border-t border-border pt-8">
        <h2 className="font-serif text-xl font-semibold text-foreground">Inbound</h2>
        {inbound.length === 0 ? (
          <div className="mt-6 border-y border-border py-12 text-center">
            <Share2 className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 font-serif text-muted">No inbound shares.</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border border-y border-border">
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
        <section className="mt-8 border-t border-border pt-8">
          <h2 className="font-serif text-xl font-semibold text-foreground">Outbound</h2>
          {outbound.length === 0 ? (
            <div className="mt-6 border-y border-border py-12 text-center">
              <Share2 className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
              <p className="mt-3 font-serif text-muted">No outbound shares.</p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border border-y border-border">
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
        <p className="mt-8 font-sans text-sm text-muted">
          Organization admins can also view outbound shares from this org.
        </p>
      )}
    </div>
  );
}

export default function SharesAdminPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <SharesAdminContent />
      </AppShell>
    </ProtectedRoute>
  );
}
