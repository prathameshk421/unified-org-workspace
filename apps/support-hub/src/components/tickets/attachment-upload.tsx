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
      <input
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv"
        disabled={disabled || saving}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        className="block w-full text-sm text-muted"
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={disabled || saving || !file}
          onClick={() => void handleUpload()}
        >
          {saving ? "Uploading…" : "Upload file"}
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
