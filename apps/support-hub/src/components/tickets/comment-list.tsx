"use client";

import { FormEvent, useState } from "react";
import type { TicketCommentResponse } from "@unified/types";
import { Button, ConfirmDialog } from "@unified/ui";

export function CommentList({
  comments,
  currentUserId,
  canMutate,
  isOrgAdmin,
  onUpdate,
  onDelete,
}: {
  comments: TicketCommentResponse[];
  currentUserId?: string;
  canMutate: boolean;
  isOrgAdmin: boolean;
  onUpdate: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (comments.length === 0) {
    return <p className="font-sans text-sm text-muted">No comments yet.</p>;
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, commentId: string) {
    event.preventDefault();
    setBusyId(commentId);
    setError(null);
    try {
      await onUpdate(commentId, draft.trim());
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update comment");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(commentId: string) {
    setPendingDeleteId(null);
    setBusyId(commentId);
    setError(null);
    try {
      await onDelete(commentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete comment");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
    <ul className="divide-y divide-border border-y border-border">
      {comments.map((comment) => {
        const isAuthor = comment.authorId === currentUserId;
        const canEdit = canMutate && isAuthor;
        const canDelete = canMutate && (isAuthor || isOrgAdmin);
        const editing = editingId === comment.id;

        return (
          <li key={comment.id} className="px-1 py-4">
            {editing ? (
              <form
                onSubmit={(event) => void saveEdit(event, comment.id)}
                className="space-y-3"
              >
                <textarea
                  rows={3}
                  maxLength={10000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-serif text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none"
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={busyId === comment.id}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <p className="whitespace-pre-wrap font-serif text-sm text-foreground">
                  {comment.body}
                </p>
                <p className="mt-2 font-sans text-xs text-muted">
                  {new Date(comment.createdAt).toLocaleString()}
                </p>
                {(canEdit || canDelete) && (
                  <div className="mt-3 flex gap-2">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        disabled={busyId === comment.id}
                        onClick={() => {
                          setEditingId(comment.id);
                          setDraft(comment.body);
                        }}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        disabled={busyId === comment.id}
                        onClick={() => setPendingDeleteId(comment.id)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </li>
        );
      })}
      {error ? (
        <li className="py-3">
          <p className="font-sans text-sm text-brand-700">{error}</p>
        </li>
      ) : null}
    </ul>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Delete comment?"
        description="This comment will be permanently deleted."
        confirmLabel="Delete comment"
        busy={busyId === pendingDeleteId}
        onConfirm={() => pendingDeleteId && void remove(pendingDeleteId)}
      />
    </>
  );
}
