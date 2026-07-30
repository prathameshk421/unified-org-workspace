"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { OrgRole, type OrgSettings } from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { ProtectedRoute } from "../../components/auth-guards";
import {
  getOrgSettings,
  updateOrgSettings,
} from "../../lib/org-settings-api";

function SettingsContent() {
  const { activeOrg } = useAuth();
  const isOrgAdmin = activeOrg?.role === OrgRole.ORG_ADMIN;
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [timezone, setTimezone] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [attachmentsEnabled, setAttachmentsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getOrgSettings();
        if (!cancelled) {
          setSettings(data.settings);
          setTimezone(data.settings.timezone ?? "");
          setCommentsEnabled(data.settings.featureFlags.commentsEnabled);
          setAttachmentsEnabled(data.settings.featureFlags.attachmentsEnabled);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load settings",
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
  }, [activeOrg?.orgId]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOrgAdmin) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updated = await updateOrgSettings({
        timezone: timezone.trim() || undefined,
        featureFlags: {
          commentsEnabled,
          attachmentsEnabled,
        },
      });
      setSettings(updated.settings);
      setTimezone(updated.settings.timezone ?? "");
      setCommentsEnabled(updated.settings.featureFlags.commentsEnabled);
      setAttachmentsEnabled(updated.settings.featureFlags.attachmentsEnabled);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-muted">
        <p className="text-muted">Loading settings…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-muted px-6 py-10">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="text-sm text-brand-600 underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-semibold text-foreground">
          Organization settings
        </h1>
        <p className="mt-2 text-sm text-muted">
          {activeOrg?.orgName ?? "Active organization"}
        </p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link
            href="/settings/connections"
            className="text-brand-600 underline"
          >
            Org connections
          </Link>
          <Link href="/settings/shares" className="text-brand-600 underline">
            Share grants
          </Link>
        </p>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-green-700">{message}</p> : null}

        {isOrgAdmin ? (
          <form
            onSubmit={(event) => void onSave(event)}
            className="mt-6 space-y-4 rounded-lg border border-border bg-surface p-6"
          >
            <div>
              <label htmlFor="timezone" className="mb-1 block text-sm text-muted">
                Timezone
              </label>
              <input
                id="timezone"
                type="text"
                maxLength={64}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="America/New_York"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={commentsEnabled}
                onChange={(event) => setCommentsEnabled(event.target.checked)}
              />
              Comments enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={attachmentsEnabled}
                onChange={(event) =>
                  setAttachmentsEnabled(event.target.checked)
                }
              />
              Attachments enabled
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </form>
        ) : (
          <div className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-6 text-sm">
            <p>
              <span className="text-muted">Timezone:</span>{" "}
              {settings?.timezone ?? "Not set"}
            </p>
            <p>
              <span className="text-muted">Comments:</span>{" "}
              {settings?.featureFlags.commentsEnabled ? "Enabled" : "Disabled"}
            </p>
            <p>
              <span className="text-muted">Attachments:</span>{" "}
              {settings?.featureFlags.attachmentsEnabled
                ? "Enabled"
                : "Disabled"}
            </p>
            <p className="text-muted">
              Only organization admins can change these settings.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
