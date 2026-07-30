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
    <section className="border-t border-border pt-8">
      <h2 className="font-serif text-xl font-semibold text-foreground">Comments</h2>
      {loading ? (
        <p className="mt-3 font-sans text-sm text-muted">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="mt-3 font-sans text-sm text-muted">No comments yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {comments.map((comment) => (
            <li key={comment.id} className="px-1 py-4">
              <p className="whitespace-pre-wrap font-serif text-sm text-foreground">
                {comment.body}
              </p>
              <p className="mt-2 font-sans text-xs text-muted">
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
          className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-serif text-sm text-foreground transition-colors duration-200 focus:border-brand-600 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !body.trim()}>
            {saving ? "Posting…" : "Post comment"}
          </Button>
          {error ? <p className="font-sans text-sm text-brand-700">{error}</p> : null}
        </div>
      </form>
    </section>
  );
}
