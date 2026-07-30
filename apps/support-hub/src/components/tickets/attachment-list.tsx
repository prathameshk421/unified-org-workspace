"use client";

import { useState } from "react";
import type { TicketAttachmentResponse } from "@unified/types";
import { Button } from "@unified/ui";

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

  if (attachments.length === 0) {
    return <p className="text-sm text-muted">No attachments yet.</p>;
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
    if (!window.confirm("Delete this attachment?")) return;
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
    <ul className="space-y-3">
      {attachments.map((attachment) => {
        const canDelete =
          canMutate &&
          (attachment.uploadedById === currentUserId || isOrgAdmin);

        return (
          <li
            key={attachment.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {attachment.fileName}
              </p>
              <p className="text-xs text-muted">
                {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busyId === attachment.id}
                onClick={() => void download(attachment)}
              >
                Download
              </Button>
              {canDelete ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyId === attachment.id}
                  onClick={() => void remove(attachment.id)}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </ul>
  );
}
