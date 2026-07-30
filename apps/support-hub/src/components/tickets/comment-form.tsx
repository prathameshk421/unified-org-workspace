"use client";

import { FormEvent, useState } from "react";
import { Button } from "@unified/ui";

export function CommentForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (body: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || disabled) return;

    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
      <label
        htmlFor="comment-body"
        className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
      >
        New comment
      </label>
      <textarea
        id="comment-body"
        rows={3}
        maxLength={10000}
        value={body}
        disabled={disabled || saving}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Add a comment…"
        className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-serif text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none disabled:opacity-50"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={disabled || saving || !body.trim()}>
          {saving ? "Posting…" : "Post comment"}
        </Button>
        {error ? (
          <p className="font-sans text-sm text-brand-700">{error}</p>
        ) : null}
      </div>
    </form>
  );
}
