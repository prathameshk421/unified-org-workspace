"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  OrgRole,
  TICKET_STATUS_TRANSITIONS,
  type OrgSettings,
  type TicketAttachmentResponse,
  type TicketCommentResponse,
  type TicketResponse,
  type TicketStatus,
} from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { AppShell } from "../../../components/app-shell";
import { ProtectedRoute } from "../../../components/auth-guards";
import { AttachmentList } from "../../../components/tickets/attachment-list";
import { AttachmentUpload } from "../../../components/tickets/attachment-upload";
import { CommentForm } from "../../../components/tickets/comment-form";
import { CommentList } from "../../../components/tickets/comment-list";
import { TicketSharePanel } from "../../../components/tickets/share-panel";
import {
  deleteAttachment,
  downloadAttachment,
  listAttachments,
  uploadAttachment,
} from "../../../lib/attachments-api";
import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
} from "../../../lib/comments-api";
import { getOrgSettings } from "../../../lib/org-settings-api";
import {
  deleteTicket,
  getTicket,
  updateTicket,
  updateTicketStatus,
} from "../../../lib/tickets-api";

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

function TicketDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, activeOrg } = useAuth();
  const [ticket, setTicket] = useState<TicketResponse | null>(null);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [comments, setComments] = useState<TicketCommentResponse[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachmentResponse[]>(
    [],
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isShared = ticket?.access === "shared";
  const canMutate =
    !isShared && activeOrg?.role !== OrgRole.CROSS_ORG_GUEST;
  const isOrgAdmin = !isShared && activeOrg?.role === OrgRole.ORG_ADMIN;
  const ticketId = params.id;
  // Owner-org flags are enforced by the API on shared path; home settings are a UX hint for members.
  const commentsEnabled = isShared
    ? true
    : (settings?.featureFlags.commentsEnabled ?? true);
  const attachmentsEnabled = isShared
    ? true
    : (settings?.featureFlags.attachmentsEnabled ?? true);
  const backHref = isShared ? "/shared/tickets" : "/tickets";
  const backLabel = isShared ? "Shared with me" : "Tickets";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const ticketData = await getTicket(ticketId);
        if (cancelled) return;

        setTicket(ticketData);
        setTitle(ticketData.title);
        setDescription(ticketData.description);

        const shared = ticketData.access === "shared";
        const [settingsResult, commentsData, attachmentsData] =
          await Promise.all([
            shared
              ? Promise.resolve(null)
              : getOrgSettings().catch(() => null),
            listComments(ticketId),
            listAttachments(ticketId),
          ]);

        if (!cancelled) {
          if (settingsResult) {
            setSettings(settingsResult.settings);
          }
          setComments(commentsData.comments);
          setAttachments(attachmentsData.attachments);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load ticket");
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
  }, [ticketId, activeOrg?.orgId]);

  async function refreshComments() {
    const data = await listComments(ticketId);
    setComments(data.comments);
  }

  async function refreshAttachments() {
    const data = await listAttachments(ticketId);
    setAttachments(data.attachments);
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canMutate || !ticket) return;

    setSaving(true);
    setError(null);

    try {
      const updated = await updateTicket(ticket.id, {
        title: title.trim(),
        description: description.trim(),
      });
      setTicket({ ...updated, access: ticket.access, sharedFromOrg: ticket.sharedFromOrg });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket");
    } finally {
      setSaving(false);
    }
  }

  async function onStatusChange(nextStatus: TicketStatus) {
    if (!canMutate || !ticket) return;

    setStatusUpdating(true);
    setError(null);

    try {
      const updated = await updateTicketStatus(ticket.id, { status: nextStatus });
      setTicket({ ...updated, access: ticket.access, sharedFromOrg: ticket.sharedFromOrg });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  }

  async function onDelete() {
    if (!canMutate || !ticket) return;
    if (!window.confirm("Delete this ticket permanently?")) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteTicket(ticket.id);
      router.push("/tickets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete ticket");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="font-sans text-muted">Loading ticket…</p>
      </AppShell>
    );
  }

  if (error && !ticket) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <Link
            href="/tickets"
            className="font-sans text-sm text-brand-600 transition-colors duration-200 hover:text-brand-700"
          >
            ← Tickets
          </Link>
          <p className="mt-4 font-sans text-brand-700">{error}</p>
        </div>
      </AppShell>
    );
  }

  if (!ticket) {
    return null;
  }

  const nextStatuses = TICKET_STATUS_TRANSITIONS[ticket.status];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <Link
          href={backHref}
          className="font-sans text-sm text-brand-600 transition-colors duration-200 hover:text-brand-700"
        >
          ← {backLabel}
        </Link>

        <div className="mt-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
              {ticket.title}
            </h1>
            <p className="mt-1 font-sans text-sm text-muted">
              Updated {new Date(ticket.updatedAt).toLocaleString()}
            </p>
            {isShared && ticket.sharedFromOrg ? (
              <p className="mt-2 inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 font-sans text-xs font-medium text-brand-700">
                Shared from {ticket.sharedFromOrg.orgName} · view & comment only
              </p>
            ) : null}
          </div>
          <StatusBadge status={ticket.status} />
        </div>

        {editing && canMutate ? (
          <form
            onSubmit={(event) => void onSave(event)}
            className="mt-8 space-y-4 border-y border-border py-8"
          >
            <div>
              <label
                htmlFor="edit-title"
                className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
              >
                Title
              </label>
              <input
                id="edit-title"
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
                htmlFor="edit-description"
                className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
              >
                Description
              </label>
              <textarea
                id="edit-description"
                rows={6}
                maxLength={10000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-serif text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="tertiary"
                onClick={() => {
                  setTitle(ticket.title);
                  setDescription(ticket.description);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-8 border-y border-border py-8">
            <p className="whitespace-pre-wrap font-serif text-foreground">
              {ticket.description || "No description"}
            </p>
            {canMutate ? (
              <Button
                type="button"
                variant="tertiary"
                className="mt-4"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            ) : null}
          </div>
        )}

        {canMutate && nextStatuses.length > 0 ? (
          <div className="mt-8 border-b border-border pb-8">
            <h2 className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
              Change status
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {nextStatuses.map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant="tertiary"
                  size="sm"
                  disabled={statusUpdating}
                  onClick={() => void onStatusChange(status)}
                >
                  → {status.replace("_", " ")}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <section className="mt-8 border-b border-border pb-8">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Comments
          </h2>
          {!commentsEnabled ? (
            <p className="mt-2 font-sans text-sm text-muted">
              Comments are disabled for this organization
            </p>
          ) : null}
          <div className="mt-4">
            <CommentList
              comments={comments}
              currentUserId={user?.id}
              canMutate={canMutate}
              isOrgAdmin={isOrgAdmin}
              onUpdate={async (commentId, body) => {
                await updateComment(ticket.id, commentId, { body });
                await refreshComments();
              }}
              onDelete={async (commentId) => {
                await deleteComment(ticket.id, commentId);
                await refreshComments();
              }}
            />
          </div>
          {commentsEnabled ? (
            <div className="mt-6">
              <CommentForm
                onSubmit={async (body) => {
                  await createComment(ticket.id, { body });
                  await refreshComments();
                }}
              />
            </div>
          ) : null}
        </section>

        <section className="mt-8 border-b border-border pb-8">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Attachments
          </h2>
          {!attachmentsEnabled ? (
            <p className="mt-2 font-sans text-sm text-muted">
              Attachments are disabled for this organization
            </p>
          ) : null}
          {isShared ? (
            <p className="mt-2 font-sans text-sm text-muted">
              Shared access allows download only.
            </p>
          ) : null}
          <div className="mt-4">
            <AttachmentList
              attachments={attachments}
              currentUserId={user?.id}
              canMutate={canMutate}
              isOrgAdmin={isOrgAdmin}
              onDownload={async (attachment) => {
                await downloadAttachment(
                  ticket.id,
                  attachment.id,
                  attachment.fileName,
                );
              }}
              onDelete={async (attachmentId) => {
                await deleteAttachment(ticket.id, attachmentId);
                await refreshAttachments();
              }}
            />
          </div>
          {attachmentsEnabled && canMutate ? (
            <div className="mt-6">
              <AttachmentUpload
                onUpload={async (file) => {
                  await uploadAttachment(ticket.id, file);
                  await refreshAttachments();
                }}
              />
            </div>
          ) : null}
        </section>

        {canMutate ? (
          <div className="mt-8">
            <TicketSharePanel ticketId={ticket.id} />
          </div>
        ) : null}

        {canMutate ? (
          <div className="mt-8 border-t border-border pt-8">
            <Button
              type="button"
              variant="tertiary"
              disabled={deleting}
              onClick={() => void onDelete()}
            >
              {deleting ? "Deleting…" : "Delete ticket"}
            </Button>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 font-sans text-sm text-brand-700">{error}</p>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function TicketDetailPage() {
  return (
    <ProtectedRoute>
      <TicketDetailContent />
    </ProtectedRoute>
  );
}
