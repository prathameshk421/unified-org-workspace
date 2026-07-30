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
import { ProtectedRoute } from "../../../components/auth-guards";
import { AttachmentList } from "../../../components/tickets/attachment-list";
import { AttachmentUpload } from "../../../components/tickets/attachment-upload";
import { CommentForm } from "../../../components/tickets/comment-form";
import { CommentList } from "../../../components/tickets/comment-list";
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

  const canMutate = activeOrg?.role !== OrgRole.CROSS_ORG_GUEST;
  const isOrgAdmin = activeOrg?.role === OrgRole.ORG_ADMIN;
  const ticketId = params.id;
  const commentsEnabled = settings?.featureFlags.commentsEnabled ?? true;
  const attachmentsEnabled = settings?.featureFlags.attachmentsEnabled ?? true;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [ticketData, settingsData, commentsData, attachmentsData] =
          await Promise.all([
            getTicket(ticketId),
            getOrgSettings(),
            listComments(ticketId),
            listAttachments(ticketId),
          ]);
        if (!cancelled) {
          setTicket(ticketData);
          setTitle(ticketData.title);
          setDescription(ticketData.description);
          setSettings(settingsData.settings);
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
      setTicket(updated);
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
      setTicket(updated);
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
      <main className="flex min-h-screen items-center justify-center bg-surface-muted">
        <p className="text-muted">Loading ticket…</p>
      </main>
    );
  }

  if (error && !ticket) {
    return (
      <main className="min-h-screen bg-surface-muted px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <Link href="/tickets" className="text-sm text-brand-600 underline">
            ← Tickets
          </Link>
          <p className="mt-4 text-red-600">{error}</p>
        </div>
      </main>
    );
  }

  if (!ticket) {
    return null;
  }

  const nextStatuses = TICKET_STATUS_TRANSITIONS[ticket.status];

  return (
    <main className="min-h-screen bg-surface-muted px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/tickets" className="text-sm text-brand-600 underline">
          ← Tickets
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">{ticket.title}</h1>
            <p className="mt-1 text-sm text-muted">
              Updated {new Date(ticket.updatedAt).toLocaleString()}
            </p>
          </div>
          <StatusBadge status={ticket.status} />
        </div>

        {editing && canMutate ? (
          <form
            onSubmit={(event) => void onSave(event)}
            className="mt-6 space-y-4 rounded-lg border border-border bg-surface p-6"
          >
            <div>
              <label htmlFor="edit-title" className="mb-1 block text-sm text-muted">
                Title
              </label>
              <input
                id="edit-title"
                type="text"
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="edit-description"
                className="mb-1 block text-sm text-muted"
              >
                Description
              </label>
              <textarea
                id="edit-description"
                rows={6}
                maxLength={10000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="secondary"
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
          <div className="mt-6 rounded-lg border border-border bg-surface p-6">
            <p className="whitespace-pre-wrap text-foreground">
              {ticket.description || "No description"}
            </p>
            {canMutate ? (
              <Button
                type="button"
                variant="secondary"
                className="mt-4"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            ) : null}
          </div>
        )}

        {canMutate && nextStatuses.length > 0 ? (
          <div className="mt-6 rounded-lg border border-border bg-surface p-6">
            <h2 className="text-sm font-medium text-foreground">Change status</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {nextStatuses.map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant="secondary"
                  disabled={statusUpdating}
                  onClick={() => void onStatusChange(status)}
                >
                  → {status.replace("_", " ")}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <section className="mt-6 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-lg font-medium text-foreground">Comments</h2>
          {!commentsEnabled ? (
            <p className="mt-2 text-sm text-muted">
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
            <div className="mt-4">
              <CommentForm
                onSubmit={async (body) => {
                  await createComment(ticket.id, { body });
                  await refreshComments();
                }}
              />
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-lg font-medium text-foreground">Attachments</h2>
          {!attachmentsEnabled ? (
            <p className="mt-2 text-sm text-muted">
              Attachments are disabled for this organization
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
            <div className="mt-4">
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
          <div className="mt-6">
            <Button
              type="button"
              variant="secondary"
              disabled={deleting}
              onClick={() => void onDelete()}
            >
              {deleting ? "Deleting…" : "Delete ticket"}
            </Button>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </div>
    </main>
  );
}

export default function TicketDetailPage() {
  return (
    <ProtectedRoute>
      <TicketDetailContent />
    </ProtectedRoute>
  );
}
