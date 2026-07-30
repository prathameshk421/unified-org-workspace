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
      <textarea
        rows={3}
        maxLength={10000}
        value={body}
        disabled={disabled || saving}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Add a comment…"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={disabled || saving || !body.trim()}>
          {saving ? "Posting…" : "Post comment"}
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </form>
  );
}
