"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { OrgRole } from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { AppShell } from "../../../components/app-shell";
import { ProtectedRoute } from "../../../components/auth-guards";
import { createTicket } from "../../../lib/tickets-api";

function NewTicketForm() {
  const router = useRouter();
  const { activeOrg } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canMutate = activeOrg?.role !== OrgRole.CROSS_ORG_GUEST;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canMutate) return;

    setSubmitting(true);
    setError(null);

    try {
      const ticket = await createTicket({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/tickets/${ticket.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
      setSubmitting(false);
    }
  }

  if (!canMutate) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg text-center">
          <p className="font-serif text-muted">
            You do not have permission to create tickets.
          </p>
          <Link
            href="/tickets"
            className="mt-4 inline-block font-sans text-sm text-brand-600 transition-colors duration-200 hover:text-brand-700"
          >
            Back to tickets
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          New ticket
        </h1>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className="mt-8 space-y-4 border-t border-border pt-8"
        >
          <div>
            <label
              htmlFor="title"
              className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
            >
              Title
            </label>
            <input
              id="title"
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={5}
              maxLength={10000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-serif text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none"
            />
          </div>

          {error ? <p className="font-sans text-sm text-brand-700">{error}</p> : null}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? "Creating…" : "Create ticket"}
            </Button>
            <Link href="/tickets">
              <Button type="button" variant="tertiary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

export default function NewTicketPage() {
  return (
    <ProtectedRoute>
      <NewTicketForm />
    </ProtectedRoute>
  );
}
