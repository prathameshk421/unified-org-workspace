"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OrgRole } from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { Ticket } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { ProtectedRoute } from "../../components/auth-guards";
import { listTickets } from "../../lib/tickets-api";
import type { TicketResponse } from "@unified/types";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-brand-50 text-brand-700",
    IN_PROGRESS: "bg-surface-muted text-foreground",
    RESOLVED: "bg-brand-100 text-brand-800",
    CLOSED: "bg-surface-muted text-muted",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 font-sans text-xs font-medium ${colors[status] ?? "bg-surface-muted text-muted"}`}
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
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
              Tickets
            </h1>
            <p className="mt-1 font-sans text-sm text-muted">
              Organization: {activeOrg?.orgName ?? activeOrg?.orgId}
            </p>
          </div>
          {canMutate ? (
            <Link href="/tickets/new">
              <Button type="button">New ticket</Button>
            </Link>
          ) : null}
        </div>

        {loading ? (
          <p className="font-sans text-muted">Loading tickets…</p>
        ) : error ? (
          <p className="font-sans text-brand-700">{error}</p>
        ) : tickets.length === 0 ? (
          <div className="border-y border-border py-12 text-center">
            <Ticket className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 font-serif text-muted">
              No tickets yet.
              {canMutate ? " Create one to get started." : null}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="block px-1 py-4 transition-colors duration-200 hover:bg-surface-muted/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-serif font-semibold text-foreground">
                        {ticket.title}
                      </p>
                      {ticket.access === "shared" && ticket.sharedFromOrg ? (
                        <p className="mt-1 font-sans text-xs font-medium text-brand-600">
                          Shared from {ticket.sharedFromOrg.orgName}
                        </p>
                      ) : null}
                      <p className="mt-1 line-clamp-2 font-serif text-sm text-muted">
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
    </AppShell>
  );
}

export default function TicketsPage() {
  return (
    <ProtectedRoute>
      <TicketsListContent />
    </ProtectedRoute>
  );
}
