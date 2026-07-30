"use client";

import { useState } from "react";
import { Button } from "@unified/ui";

export function AttachmentUpload({
  onUpload,
  disabled,
}: {
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file || disabled) return;
    setSaving(true);
    setError(null);
    try {
      await onUpload(file);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="attachment-file"
        className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
      >
        Upload file
      </label>
      <input
        id="attachment-file"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv"
        disabled={disabled || saving}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        className="block w-full font-sans text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-muted file:px-3.5 file:py-1.5 file:font-sans file:text-sm file:font-medium file:text-foreground hover:file:bg-border disabled:opacity-50"
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={disabled || saving || !file}
          onClick={() => void handleUpload()}
        >
          {saving ? "Uploading…" : "Upload file"}
        </Button>
        {error ? (
          <p className="font-sans text-sm text-brand-700">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
