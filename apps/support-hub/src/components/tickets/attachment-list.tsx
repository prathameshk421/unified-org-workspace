"use client";

import { useState } from "react";
import type { TicketAttachmentResponse } from "@unified/types";
import { Button, ConfirmDialog } from "@unified/ui";

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({
  attachments,
  currentUserId,
  canMutate,
  isOrgAdmin,
  onDownload,
  onDelete,
}: {
  attachments: TicketAttachmentResponse[];
  currentUserId?: string;
  canMutate: boolean;
  isOrgAdmin: boolean;
  onDownload: (attachment: TicketAttachmentResponse) => Promise<void>;
  onDelete: (attachmentId: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (attachments.length === 0) {
    return <p className="font-sans text-sm text-muted">No attachments yet.</p>;
  }

  async function download(attachment: TicketAttachmentResponse) {
    setBusyId(attachment.id);
    setError(null);
    try {
      await onDownload(attachment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(attachmentId: string) {
    setPendingDeleteId(null);
    setBusyId(attachmentId);
    setError(null);
    try {
      await onDelete(attachmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <ul className="divide-y divide-border border-y border-border">
      {attachments.map((attachment) => {
        const canDelete =
          canMutate &&
          (attachment.uploadedById === currentUserId || isOrgAdmin);

        return (
          <li
            key={attachment.id}
            className="flex flex-wrap items-center justify-between gap-3 px-1 py-4"
          >
            <div>
              <p className="font-serif text-sm font-semibold text-foreground">
                {attachment.fileName}
              </p>
              <p className="mt-0.5 font-sans text-xs text-muted">
                {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                disabled={busyId === attachment.id}
                onClick={() => void download(attachment)}
              >
                Download
              </Button>
              {canDelete ? (
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  disabled={busyId === attachment.id}
                onClick={() => setPendingDeleteId(attachment.id)}
                >
                  Delete
                </Button>
              ) : null}
            </div>
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
        title="Delete attachment?"
        description="This attachment will be permanently deleted."
        confirmLabel="Delete attachment"
        busy={busyId === pendingDeleteId}
        onConfirm={() => pendingDeleteId && void remove(pendingDeleteId)}
      />
    </>
  );
}
