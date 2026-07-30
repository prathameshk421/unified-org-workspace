import type { PrStatus } from "@unified/types";

const STATUS_LABELS: Record<PrStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  MERGED: "Merged",
};

const STATUS_CLASSES: Record<PrStatus, string> = {
  DRAFT: "bg-surface-muted text-muted",
  IN_REVIEW: "bg-brand-50 text-brand-700",
  APPROVED: "bg-brand-100 text-brand-800",
  REJECTED: "border border-border bg-surface text-foreground",
  MERGED: "bg-surface-muted text-foreground",
};

export function PrStatusBadge({ status }: { status: PrStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
      data-testid={`pr-status-${status}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
