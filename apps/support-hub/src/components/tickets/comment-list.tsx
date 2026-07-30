"use client";

import { FormEvent, useState } from "react";
import type { TicketCommentResponse } from "@unified/types";
import { Button } from "@unified/ui";

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

  if (comments.length === 0) {
    return <p className="text-sm text-muted">No comments yet.</p>;
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
    if (!window.confirm("Delete this comment?")) return;
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
    <ul className="space-y-4">
      {comments.map((comment) => {
        const isAuthor = comment.authorId === currentUserId;
        const canEdit = canMutate && isAuthor;
        const canDelete = canMutate && (isAuthor || isOrgAdmin);
        const editing = editingId === comment.id;

        return (
          <li
            key={comment.id}
            className="rounded-md border border-border bg-surface-muted/40 p-3"
          >
            {editing ? (
              <form
                onSubmit={(event) => void saveEdit(event, comment.id)}
                className="space-y-2"
              >
                <textarea
                  rows={3}
                  maxLength={10000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={busyId === comment.id}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {comment.body}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {new Date(comment.createdAt).toLocaleString()}
                </p>
                {(canEdit || canDelete) && (
                  <div className="mt-2 flex gap-2">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="secondary"
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
                        variant="secondary"
                        disabled={busyId === comment.id}
                        onClick={() => void remove(comment.id)}
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </ul>
  );
}
