"use client";

import { AuthError } from "@unified/auth-client";
import { useAuth } from "@unified/auth-client/react";
import {
  OrgRole,
  PrReviewDecision,
  PrStatus,
  type PrDiffResponse,
  type PullRequestDetail,
  type UpdatePrRequest,
} from "@unified/types";
import { Button } from "@unified/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ForbiddenMessage } from "@/components/forbidden-message";
import { PrCommentsSection } from "@/components/prs/pr-comments";
import { PrSharePanel } from "@/components/prs/share-panel";
import { apiFetch } from "@/lib/api";
import { canMutatePrs } from "@/lib/roles";
import type { OrgMember } from "@/lib/types";
import { PrStatusBadge } from "./pr-status-badge";

const TRANSITIONS: Record<PrStatus, { label: string; to: PrStatus }[]> = {
  [PrStatus.DRAFT]: [{ label: "Submit for review", to: PrStatus.IN_REVIEW }],
  [PrStatus.IN_REVIEW]: [{ label: "Reject", to: PrStatus.REJECTED }],
  [PrStatus.APPROVED]: [
    { label: "Merge", to: PrStatus.MERGED },
    { label: "Reject", to: PrStatus.REJECTED },
  ],
  [PrStatus.REJECTED]: [{ label: "Re-open", to: PrStatus.IN_REVIEW }],
  [PrStatus.MERGED]: [],
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function PrDetailPage({ prId }: { prId: string }) {
  const { user, activeOrg } = useAuth();
  const [pr, setPr] = useState<PullRequestDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [diff, setDiff] = useState<PrDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editApprovals, setEditApprovals] = useState(1);
  const [editReviewerIds, setEditReviewerIds] = useState<string[]>([]);
  const [reviewComment, setReviewComment] = useState("");

  const isShared = pr?.access === "shared";
  const canMutate = !isShared && canMutatePrs(activeOrg?.role);

  const loadPr = useCallback(async () => {
    setError(null);
    setForbidden(false);

    try {
      const data = await apiFetch<PullRequestDetail>(`/prs/${prId}`);
      setPr(data);
      setEditTitle(data.title);
      setEditDescription(data.description);
      setEditApprovals(data.requiresApprovals);
      setEditReviewerIds(data.reviewers.map((reviewer) => reviewer.userId));
      setSelectedVersion((current) => current ?? data.currentVersion);
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        setForbidden(true);
        return;
      }
      if (err instanceof AuthError && err.status === 404) {
        setError("Pull request not found.");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load pull request");
    }
  }, [prId]);

  const loadMembers = useCallback(async () => {
    try {
      const data = await apiFetch<OrgMember[]>("/org/members");
      setMembers(data);
    } catch {
      // Members are optional for display; edit form may be limited.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setSelectedVersion(null);
      await Promise.all([loadPr(), loadMembers()]);
      if (!cancelled) {
        setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [loadPr, loadMembers, activeOrg?.orgId]);

  useEffect(() => {
    if (selectedVersion === null || isShared) {
      setDiff(null);
      return;
    }

    let cancelled = false;

    async function loadDiff() {
      try {
        const data = await apiFetch<PrDiffResponse>(
          `/prs/${prId}/versions/${selectedVersion}/diff`,
        );
        if (!cancelled) {
          setDiff(data);
        }
      } catch {
        if (!cancelled) {
          setDiff(null);
        }
      }
    }

    void loadDiff();
    return () => {
      cancelled = true;
    };
  }, [prId, selectedVersion, isShared]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.id, member.name);
    }
    return map;
  }, [members]);

  const currentVersionReviews = useMemo(() => {
    if (!pr) return [];
    const currentVersion = pr.versions.find(
      (version) => version.versionNumber === pr.currentVersion,
    );
    if (!currentVersion) return [];

    const latestByReviewer = new Map<string, (typeof pr.reviews)[number]>();
    for (const review of pr.reviews) {
      if (review.versionId !== currentVersion.id) continue;
      const existing = latestByReviewer.get(review.reviewerId);
      if (!existing || review.createdAt > existing.createdAt) {
        latestByReviewer.set(review.reviewerId, review);
      }
    }
    return [...latestByReviewer.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [pr]);

  const approveCount = currentVersionReviews.filter(
    (review) => review.decision === PrReviewDecision.APPROVE,
  ).length;

  const canReview =
    canMutate &&
    pr?.status === PrStatus.IN_REVIEW &&
    user &&
    (activeOrg?.role === OrgRole.ORG_ADMIN ||
      pr.reviewers.some((reviewer) => reviewer.userId === user.id));

  const canEdit = canMutate && pr?.status !== PrStatus.MERGED;
  const backHref = isShared ? "/shared/prs" : "/prs";
  const backLabel = isShared ? "Shared with me" : "Pull requests";

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await loadPr();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!pr || !canMutate) return;
    const body: UpdatePrRequest = {
      title: editTitle.trim(),
      description: editDescription.trim(),
      requiresApprovals: editApprovals,
      reviewerIds: editReviewerIds,
    };

    await runAction(async () => {
      const updated = await apiFetch<PullRequestDetail>(`/prs/${pr.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setPr({
        ...updated,
        access: pr.access,
        sharedFromOrg: pr.sharedFromOrg,
      });
      setSelectedVersion(updated.currentVersion);
    });
  }

  async function handleTransition(to: PrStatus) {
    if (!pr || !canMutate) return;
    await runAction(async () => {
      const updated = await apiFetch<PullRequestDetail>(`/prs/${pr.id}/transition`, {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      setPr({
        ...updated,
        access: pr.access,
        sharedFromOrg: pr.sharedFromOrg,
      });
    });
  }

  async function handleReview(decision: PrReviewDecision) {
    if (!pr || !canMutate) return;
    await runAction(async () => {
      const updated = await apiFetch<PullRequestDetail>(`/prs/${pr.id}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          comment: reviewComment.trim() || undefined,
        }),
      });
      setPr({
        ...updated,
        access: pr.access,
        sharedFromOrg: pr.sharedFromOrg,
      });
      setReviewComment("");
    });
  }

  function toggleReviewer(userId: string) {
    setEditReviewerIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  if (loading) {
    return <p className="text-muted">Loading pull request…</p>;
  }

  if (forbidden) {
    return <ForbiddenMessage />;
  }

  if (error || !pr) {
    return (
      <div className="space-y-4">
        <p className="text-red-700">{error ?? "Pull request not found."}</p>
        <Link href="/prs" className="text-sm text-brand-600 underline">
          Back to pull requests
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={backHref} className="text-sm text-brand-600 underline">
            ← {backLabel}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-foreground" data-testid="pr-title">
            {pr.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
            <PrStatusBadge status={pr.status} />
            <span>Version {pr.currentVersion}</span>
            <span>
              {approveCount}/{pr.requiresApprovals} approvals on current version
            </span>
          </div>
          {isShared && pr.sharedFromOrg ? (
            <p className="mt-2 inline-flex rounded-full bg-brand-600/10 px-2.5 py-0.5 text-xs font-medium text-brand-600">
              Shared from {pr.sharedFromOrg.orgName} · view & comment only
            </p>
          ) : null}
        </div>
      </div>

      {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-foreground">Details</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
          {pr.description || "No description"}
        </p>
        <dl className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">Author</dt>
            <dd>{memberNameById.get(pr.authorId) ?? pr.authorId}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Updated</dt>
            <dd>{formatDate(pr.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      {canEdit ? (
        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-lg font-medium text-foreground">Edit</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="edit-title" className="mb-1 block text-sm font-medium">
                Title
              </label>
              <input
                id="edit-title"
                type="text"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="edit-description" className="mb-1 block text-sm font-medium">
                Description
              </label>
              <textarea
                id="edit-description"
                rows={4}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="edit-approvals" className="mb-1 block text-sm font-medium">
                Required approvals
              </label>
              <input
                id="edit-approvals"
                type="number"
                min={1}
                value={editApprovals}
                onChange={(event) => setEditApprovals(Number(event.target.value))}
                className="w-32 rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            {members.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium">Reviewers</p>
                <ul className="space-y-2">
                  {members.map((member) => (
                    <li key={member.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editReviewerIds.includes(member.id)}
                          onChange={() => toggleReviewer(member.id)}
                        />
                        <span>
                          {member.name} ({member.email})
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button
              type="button"
              disabled={busy || !editTitle.trim()}
              onClick={() => void handleSave()}
              data-testid="save-pr-button"
            >
              Save changes
            </Button>
          </div>
        </section>
      ) : null}

      {canMutate && TRANSITIONS[pr.status].length > 0 ? (
        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-lg font-medium text-foreground">Status transitions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {TRANSITIONS[pr.status].map((transition) => (
              <Button
                key={transition.to}
                type="button"
                variant={transition.to === PrStatus.REJECTED ? "secondary" : "primary"}
                disabled={busy}
                onClick={() => void handleTransition(transition.to)}
                data-testid={`transition-${transition.to}`}
              >
                {transition.label}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {canReview ? (
        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-lg font-medium text-foreground">Your review</h2>
          <textarea
            rows={3}
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
            placeholder="Optional comment"
            className="mt-4 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            data-testid="review-comment"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void handleReview(PrReviewDecision.APPROVE)}
              data-testid="approve-button"
            >
              Approve
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleReview(PrReviewDecision.REQUEST_CHANGES)}
              data-testid="request-changes-button"
            >
              Request changes
            </Button>
          </div>
        </section>
      ) : null}

      <PrCommentsSection prId={pr.id} />

      {canMutate ? <PrSharePanel prId={pr.id} /> : null}

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-foreground">Reviewers</h2>
        {pr.reviewers.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No reviewers assigned.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {pr.reviewers.map((reviewer) => (
              <li key={reviewer.userId}>
                {memberNameById.get(reviewer.userId) ?? reviewer.userId}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-foreground">Reviews on current version</h2>
        {currentVersionReviews.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No reviews yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {currentVersionReviews.map((review) => (
              <li key={review.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {memberNameById.get(review.reviewerId) ?? review.reviewerId}
                  </span>
                  <span className="text-muted">{review.decision}</span>
                </div>
                {review.comment ? <p className="mt-1 text-muted">{review.comment}</p> : null}
                <p className="mt-1 text-xs text-muted">{formatDate(review.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-foreground">Versions</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {[...pr.versions]
            .sort((a, b) => b.versionNumber - a.versionNumber)
            .map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => setSelectedVersion(version.versionNumber)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  selectedVersion === version.versionNumber
                    ? "bg-brand-600 text-white"
                    : "border border-border bg-surface text-foreground hover:bg-surface-muted"
                }`}
                data-testid={`version-${version.versionNumber}`}
              >
                v{version.versionNumber}
              </button>
            ))}
        </div>

        {selectedVersion !== null ? (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-foreground">
              Diff for version {selectedVersion}
            </h3>
            {isShared ? (
              <p className="mt-2 text-sm text-muted">
                Version diffs are not available on shared access.
              </p>
            ) : !diff ? (
              <p className="mt-2 text-sm text-muted">Loading diff…</p>
            ) : diff.changes.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No changes from previous version.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {diff.changes.map((change) => (
                  <li
                    key={change.field}
                    className="rounded-md border border-border bg-surface-muted p-3 text-sm"
                  >
                    <p className="font-medium text-foreground">{change.field}</p>
                    <p className="mt-2 text-muted">
                      <span className="font-medium">Before:</span> {change.before || "(empty)"}
                    </p>
                    <p className="mt-1 text-foreground">
                      <span className="font-medium">After:</span> {change.after || "(empty)"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
