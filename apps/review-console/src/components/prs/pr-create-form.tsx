"use client";

import { AuthError } from "@unified/auth-client";
import type { CreatePrRequest, PullRequestDetail } from "@unified/types";
import { Button } from "@unified/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ForbiddenMessage } from "@/components/forbidden-message";
import { apiFetch } from "@/lib/api";
import type { OrgMember } from "@/lib/types";

export function PrCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiresApprovals, setRequiresApprovals] = useState(1);
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<string[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMembers() {
      try {
        const data = await apiFetch<OrgMember[]>("/org/members");
        if (!cancelled) {
          setMembers(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof AuthError && err.status === 403) {
            setForbidden(true);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load members");
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingMembers(false);
        }
      }
    }

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleReviewer(userId: string) {
    setSelectedReviewerIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const body: CreatePrRequest = {
      title: title.trim(),
      description: description.trim(),
      requiresApprovals,
      reviewerIds: selectedReviewerIds,
    };

    try {
      const pr = await apiFetch<PullRequestDetail>("/prs", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/prs/${pr.id}`);
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to create pull request");
      }
      setSubmitting(false);
    }
  }

  if (forbidden) {
    return <ForbiddenMessage />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">New pull request</h1>
        <p className="mt-1 text-sm text-muted">
          Create a draft pull request for your organization.
        </p>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="space-y-5 rounded-lg border border-border bg-surface p-6"
      >
        <div>
          <label htmlFor="pr-title" className="mb-1 block text-sm font-medium text-foreground">
            Title
          </label>
          <input
            id="pr-title"
            type="text"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            data-testid="pr-title-input"
          />
        </div>

        <div>
          <label
            htmlFor="pr-description"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Description
          </label>
          <textarea
            id="pr-description"
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            data-testid="pr-description-input"
          />
        </div>

        <div>
          <label htmlFor="pr-approvals" className="mb-1 block text-sm font-medium text-foreground">
            Required approvals
          </label>
          <input
            id="pr-approvals"
            type="number"
            min={1}
            required
            value={requiresApprovals}
            onChange={(event) => setRequiresApprovals(Number(event.target.value))}
            className="w-32 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            data-testid="pr-approvals-input"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Reviewers</p>
          {loadingMembers ? (
            <p className="text-sm text-muted">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted">No members available.</p>
          ) : (
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedReviewerIds.includes(member.id)}
                      onChange={() => toggleReviewer(member.id)}
                      data-testid={`reviewer-${member.id}`}
                    />
                    <span className="text-foreground">
                      {member.name} ({member.email})
                    </span>
                    <span className="text-muted">{member.role}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={submitting || !title.trim()}
            data-testid="create-pr-submit"
          >
            {submitting ? "Creating…" : "Create pull request"}
          </Button>
        </div>
      </form>
    </div>
  );
}
