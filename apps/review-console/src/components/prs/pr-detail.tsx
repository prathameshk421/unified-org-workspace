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

const inputClassName =
  "w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm text-foreground transition-colors duration-200 focus:border-brand-600 focus:outline-none";

const labelClassName =
  "mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted";

const sectionClassName = "border-t border-border pt-8";

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function PrDetailPage({ prId }: { prId: string }) {
  const { user, activeOrg } = useAuth();
  const [pr, setPr] = useState<PullRequestDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [diff, setDiff] = useState<PrDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
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

  const maxEditApprovals = Math.max(editReviewerIds.length, 1);
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
      setDiffError(null);
      setDiffLoading(false);
      return;
    }

    let cancelled = false;

    async function loadDiff() {
      setDiffLoading(true);
      setDiffError(null);
      setDiff(null);
      try {
        const data = await apiFetch<PrDiffResponse>(
          `/prs/${prId}/versions/${selectedVersion}/diff`,
        );
        if (!cancelled) {
          setDiff(data);
        }
      } catch (err) {
        if (!cancelled) {
          setDiff(null);
          setDiffError(err instanceof Error ? err.message : "Unable to load this version diff.");
        }
      } finally {
        if (!cancelled) {
          setDiffLoading(false);
        }
      }
    }

    void loadDiff();
    return () => {
      cancelled = true;
    };
  }, [prId, selectedVersion, isShared]);

  useEffect(() => {
    setEditApprovals((current) => Math.min(Math.max(current, 1), maxEditApprovals));
  }, [maxEditApprovals]);

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
      requiresApprovals: Math.min(editApprovals, maxEditApprovals),
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
    return <p className="font-sans text-muted">Loading pull request…</p>;
  }

  if (forbidden) {
    return <ForbiddenMessage />;
  }

  if (error || !pr) {
    return (
      <div className="space-y-4">
        <p className="font-sans text-brand-700">{error ?? "Pull request not found."}</p>
        <Link
          href="/prs"
          className="font-sans text-sm text-brand-600 transition-colors duration-200 hover:text-brand-700"
        >
          Back to pull requests
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={backHref}
            className="font-sans text-sm text-brand-600 transition-colors duration-200 hover:text-brand-700"
          >
            ← {backLabel}
          </Link>
          <h1
            className="mt-3 font-serif text-3xl font-bold tracking-tight text-foreground"
            data-testid="pr-title"
          >
            {pr.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 font-sans text-sm text-muted">
            <PrStatusBadge status={pr.status} />
            <span>Version {pr.currentVersion}</span>
            <span>
              {approveCount}/{pr.requiresApprovals} approvals on current version
            </span>
          </div>
          {isShared && pr.sharedFromOrg ? (
            <p className="mt-3 inline-flex rounded-full bg-brand-600/10 px-2.5 py-0.5 font-sans text-xs font-medium text-brand-600">
              Shared from {pr.sharedFromOrg.orgName} · view & comment only
            </p>
          ) : null}
        </div>
      </div>

      {actionError ? <p className="font-sans text-sm text-brand-700">{actionError}</p> : null}

      <section className={sectionClassName}>
        <h2 className="font-serif text-xl font-semibold text-foreground">Details</h2>
        <p className="mt-3 whitespace-pre-wrap font-serif text-sm text-foreground">
          {pr.description || "No description"}
        </p>
        <dl className="mt-4 grid gap-3 font-sans text-sm text-muted sm:grid-cols-2">
          <div>
            <dt className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
              Author
            </dt>
            <dd className="mt-1 text-foreground">
              {memberNameById.get(pr.authorId) ?? pr.authorId}
            </dd>
          </div>
          <div>
            <dt className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
              Updated
            </dt>
            <dd className="mt-1 text-foreground">{formatDate(pr.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      {canEdit ? (
        <section className={sectionClassName}>
          <h2 className="font-serif text-xl font-semibold text-foreground">Edit</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="edit-title" className={labelClassName}>
                Title
              </label>
              <input
                id="edit-title"
                type="text"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="edit-description" className={labelClassName}>
                Description
              </label>
              <textarea
                id="edit-description"
                rows={4}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-serif text-sm text-foreground transition-colors duration-200 focus:border-brand-600 focus:outline-none"
              />
            </div>
            {members.length > 0 ? (
              <div>
                <p className={labelClassName}>Reviewers</p>
                <ul className="space-y-2">
                  {members.map((member) => (
                    <li key={member.id}>
                      <label className="flex items-center gap-2 font-sans text-sm">
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
            <div>
              <label htmlFor="edit-approvals" className={labelClassName}>
                Required approvals
              </label>
              <input
                id="edit-approvals"
                type="number"
                min={1}
                max={maxEditApprovals}
                value={editApprovals}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  setEditApprovals(Math.min(Math.max(Math.trunc(next), 1), maxEditApprovals));
                }}
                className="w-32 rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm text-foreground transition-colors duration-200 focus:border-brand-600 focus:outline-none"
              />
              <p className="mt-1.5 font-sans text-xs text-muted">
                {editReviewerIds.length === 0
                  ? "Select reviewers to raise the approval threshold above 1."
                  : `At most ${maxEditApprovals} (one per selected reviewer).`}
              </p>
            </div>
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
        <section className={sectionClassName}>
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Status transitions
          </h2>
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
        <section className={sectionClassName}>
          <h2 className="font-serif text-xl font-semibold text-foreground">Your review</h2>
          <textarea
            rows={3}
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
            placeholder="Optional comment"
            className="mt-4 w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-serif text-sm text-foreground transition-colors duration-200 focus:border-brand-600 focus:outline-none"
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

      <section className={sectionClassName}>
        <h2 className="font-serif text-xl font-semibold text-foreground">Reviewers</h2>
        {pr.reviewers.length === 0 ? (
          <p className="mt-3 font-sans text-sm text-muted">No reviewers assigned.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {pr.reviewers.map((reviewer) => (
              <li key={reviewer.userId} className="px-1 py-3 font-sans text-sm text-foreground">
                {memberNameById.get(reviewer.userId) ?? reviewer.userId}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={sectionClassName}>
        <h2 className="font-serif text-xl font-semibold text-foreground">
          Reviews on current version
        </h2>
        {currentVersionReviews.length === 0 ? (
          <p className="mt-3 font-sans text-sm text-muted">No reviews yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {currentVersionReviews.map((review) => (
              <li key={review.id} className="px-1 py-3 font-sans text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-serif font-semibold text-foreground">
                    {memberNameById.get(review.reviewerId) ?? review.reviewerId}
                  </span>
                  <span className="inline-flex rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-muted">
                    {review.decision}
                  </span>
                </div>
                {review.comment ? (
                  <p className="mt-1 font-serif text-muted">{review.comment}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted">{formatDate(review.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={sectionClassName}>
        <h2 className="font-serif text-xl font-semibold text-foreground">Versions</h2>
        <div className="mt-4 max-w-sm">
          <label htmlFor="pr-version" className={labelClassName}>
            Compare selected version with its predecessor
          </label>
          <select
            id="pr-version"
            value={selectedVersion ?? ""}
            onChange={(event) => setSelectedVersion(Number(event.target.value))}
            className={inputClassName}
            data-testid="pr-version-picker"
          >
            {[...pr.versions]
              .sort((a, b) => b.versionNumber - a.versionNumber)
              .map((version) => (
                <option key={version.id} value={version.versionNumber}>
                  Version {version.versionNumber}
                  {version.versionNumber === pr.currentVersion ? " — current" : ""}
                </option>
              ))}
          </select>
        </div>

        {selectedVersion !== null ? (
          <div className="mt-4">
            <h3 className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
              Diff for version {selectedVersion}
            </h3>
            {isShared ? (
              <p className="mt-2 font-sans text-sm text-muted">
                Version diffs are not available on shared access.
              </p>
            ) : diffLoading ? (
              <p className="mt-2 font-sans text-sm text-muted">Loading diff…</p>
            ) : diffError ? (
              <p className="mt-2 font-sans text-sm text-brand-700">{diffError}</p>
            ) : !diff ? (
              <p className="mt-2 font-sans text-sm text-muted">No diff is available for this version.</p>
            ) : diff.changes.length === 0 ? (
              <p className="mt-2 font-sans text-sm text-muted">No changes from previous version.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {diff.changes.map((change) => (
                  <li key={change.field} className="px-1 py-4 font-sans text-sm">
                    <p className="font-serif font-semibold text-foreground">{change.field}</p>
                    <p className="mt-2 text-muted">
                      <span className="font-medium text-foreground">Before:</span>{" "}
                      {change.before || "(empty)"}
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
