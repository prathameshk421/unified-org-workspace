"use client";

import { FormEvent, useEffect, useState } from "react";
import { OrgRole, type OrgSettings } from "@unified/types";
import { useAuth } from "@unified/auth-client/react";
import { Button } from "@unified/ui";
import { AppShell } from "../../components/app-shell";
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
      <AppShell>
        <p className="font-sans text-muted">Loading settings…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          Organization settings
        </h1>
        <p className="mt-1 font-sans text-sm text-muted">
          {activeOrg?.orgName ?? "Active organization"}
        </p>

        {error ? (
          <p className="mt-4 font-sans text-sm text-brand-700">{error}</p>
        ) : null}
        {message ? (
          <p className="mt-4 font-sans text-sm text-brand-600">{message}</p>
        ) : null}

        {isOrgAdmin ? (
          <form
            onSubmit={(event) => void onSave(event)}
            className="mt-8 space-y-5 border-t border-border pt-8"
          >
            <div>
              <label
                htmlFor="timezone"
                className="mb-1.5 block font-sans text-xs font-medium uppercase tracking-wider text-muted"
              >
                Timezone
              </label>
              <input
                id="timezone"
                type="text"
                maxLength={64}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="America/New_York"
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-sans text-sm transition-colors duration-200 focus:border-brand-600 focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2.5 font-sans text-sm text-foreground">
              <input
                type="checkbox"
                checked={commentsEnabled}
                onChange={(event) => setCommentsEnabled(event.target.checked)}
                className="rounded border-border"
              />
              Comments enabled
            </label>
            <label className="flex items-center gap-2.5 font-sans text-sm text-foreground">
              <input
                type="checkbox"
                checked={attachmentsEnabled}
                onChange={(event) =>
                  setAttachmentsEnabled(event.target.checked)
                }
                className="rounded border-border"
              />
              Attachments enabled
            </label>
            <div className="pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-8 space-y-4 border-y border-border py-8 font-sans text-sm">
            <div>
              <p className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
                Timezone
              </p>
              <p className="mt-1 font-serif text-foreground">
                {settings?.timezone ?? "Not set"}
              </p>
            </div>
            <div>
              <p className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
                Comments
              </p>
              <p className="mt-1 font-serif text-foreground">
                {settings?.featureFlags.commentsEnabled ? "Enabled" : "Disabled"}
              </p>
            </div>
            <div>
              <p className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
                Attachments
              </p>
              <p className="mt-1 font-serif text-foreground">
                {settings?.featureFlags.attachmentsEnabled
                  ? "Enabled"
                  : "Disabled"}
              </p>
            </div>
            <p className="pt-2 text-muted">
              Only organization admins can change these settings.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
