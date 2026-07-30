"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { OrgRole } from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
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
      <main className="min-h-screen bg-surface-muted px-6 py-10">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-muted">You do not have permission to create tickets.</p>
          <Link href="/tickets" className="mt-4 inline-block text-brand-600 underline">
            Back to tickets
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-muted px-6 py-10">
      <div className="mx-auto max-w-lg">
        <Link href="/tickets" className="text-sm text-brand-600 underline">
          ← Tickets
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">New ticket</h1>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className="mt-6 space-y-4 rounded-lg border border-border bg-surface p-6"
        >
          <div>
            <label htmlFor="title" className="mb-1 block text-sm text-muted">
              Title
            </label>
            <input
              id="title"
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="description" className="mb-1 block text-sm text-muted">
              Description
            </label>
            <textarea
              id="description"
              rows={5}
              maxLength={10000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? "Creating…" : "Create ticket"}
            </Button>
            <Link href="/tickets">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

export default function NewTicketPage() {
  return (
    <ProtectedRoute>
      <NewTicketForm />
    </ProtectedRoute>
  );
}
