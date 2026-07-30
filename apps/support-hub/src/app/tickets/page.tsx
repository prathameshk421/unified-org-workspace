"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OrgRole } from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { ProtectedRoute } from "../../components/auth-guards";
import { listTickets } from "../../lib/tickets-api";
import type { TicketResponse } from "@unified/types";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800",
    IN_PROGRESS: "bg-amber-100 text-amber-800",
    RESOLVED: "bg-green-100 text-green-800",
    CLOSED: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function TicketsListContent() {
  const { activeOrg } = useAuth();
  const [tickets, setTickets] = useState<TicketResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canMutate = activeOrg?.role !== OrgRole.CROSS_ORG_GUEST;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listTickets();
        if (!cancelled) {
          setTickets(data.tickets);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load tickets");
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
  }, [activeOrg?.orgId]);

  return (
    <main className="min-h-screen bg-surface-muted px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-brand-600 underline">
              ← Home
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Tickets</h1>
            <p className="mt-1 text-sm text-muted">
              Organization: {activeOrg?.orgName ?? activeOrg?.orgId}
            </p>
            <p className="mt-2 text-sm">
              <Link href="/shared/tickets" className="text-brand-600 underline">
                Shared with me
              </Link>
            </p>
          </div>
          {canMutate ? (
            <Link href="/tickets/new">
              <Button type="button">New ticket</Button>
            </Link>
          ) : null}
        </div>

        {loading ? (
          <p className="text-muted">Loading tickets…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : tickets.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-muted">
            No tickets yet.
            {canMutate ? " Create one to get started." : null}
          </p>
        ) : (
          <ul className="space-y-3">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="block rounded-lg border border-border bg-surface p-4 transition hover:border-brand-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{ticket.title}</p>
                      {ticket.access === "shared" && ticket.sharedFromOrg ? (
                        <p className="mt-1 text-xs font-medium text-brand-600">
                          Shared from {ticket.sharedFromOrg.orgName}
                        </p>
                      ) : null}
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {ticket.description || "No description"}
                      </p>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function TicketsPage() {
  return (
    <ProtectedRoute>
      <TicketsListContent />
    </ProtectedRoute>
  );
}
