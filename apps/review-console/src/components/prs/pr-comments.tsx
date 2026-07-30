"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PrCommentResponse } from "@unified/types";
import { Button } from "@unified/ui";
import { apiFetch } from "@/lib/api";

export function PrCommentsSection({ prId }: { prId: string }) {
  const [comments, setComments] = useState<PrCommentResponse[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await apiFetch<{ comments: PrCommentResponse[] }>(
      `/prs/${prId}/comments`,
    );
    setComments(data.comments);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load comments",
          );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/prs/${prId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: trimmed }),
      });
      setBody("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-medium text-foreground">Comments</h2>
      {loading ? (
        <p className="mt-3 text-sm text-muted">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No comments yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-md border border-border bg-surface-muted/40 p-3"
            >
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {comment.body}
              </p>
              <p className="mt-2 text-xs text-muted">
                {new Date(comment.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(event) => void onSubmit(event)}
        className="mt-4 space-y-3"
      >
        <textarea
          rows={3}
          maxLength={10000}
          value={body}
          disabled={saving}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a comment…"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !body.trim()}>
            {saving ? "Posting…" : "Post comment"}
          </Button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </form>
    </section>
  );
}
