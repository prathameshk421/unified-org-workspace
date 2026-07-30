import { z } from "zod";
import {
  DEFAULT_ORG_FEATURE_FLAGS,
  type OrgSettings,
  type OrgSettingsResponse,
} from "@unified/types";
import { prisma } from "../../lib/prisma.js";
import { TicketError } from "../tickets/service.js";

const orgFeatureFlagsSchema = z.object({
  commentsEnabled: z.boolean(),
  attachmentsEnabled: z.boolean(),
});

const orgSettingsSchema = z.object({
  timezone: z.string().trim().min(1).max(64).optional(),
  featureFlags: orgFeatureFlagsSchema,
});

export function parseOrgSettings(raw: unknown): OrgSettings {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const featureFlagsRaw =
    base.featureFlags &&
    typeof base.featureFlags === "object" &&
    !Array.isArray(base.featureFlags)
      ? (base.featureFlags as Record<string, unknown>)
      : {};

  const parsed = orgSettingsSchema.safeParse({
    timezone:
      typeof base.timezone === "string" ? base.timezone : undefined,
    featureFlags: {
      commentsEnabled:
        typeof featureFlagsRaw.commentsEnabled === "boolean"
          ? featureFlagsRaw.commentsEnabled
          : DEFAULT_ORG_FEATURE_FLAGS.commentsEnabled,
      attachmentsEnabled:
        typeof featureFlagsRaw.attachmentsEnabled === "boolean"
          ? featureFlagsRaw.attachmentsEnabled
          : DEFAULT_ORG_FEATURE_FLAGS.attachmentsEnabled,
    },
  });

  if (!parsed.success) {
    return {
      featureFlags: { ...DEFAULT_ORG_FEATURE_FLAGS },
    };
  }

  const settings: OrgSettings = {
    featureFlags: parsed.data.featureFlags,
  };

  if (parsed.data.timezone) {
    settings.timezone = parsed.data.timezone;
  }

  return settings;
}

export async function getOrgSettings(orgId: string): Promise<OrgSettingsResponse> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, settings: true },
  });

  if (!org) {
    throw new TicketError("Organization not found", 404);
  }

  return {
    orgId: org.id,
    settings: parseOrgSettings(org.settings),
  };
}

export async function updateOrgSettings(
  orgId: string,
  patch: {
    timezone?: string;
    featureFlags?: {
      commentsEnabled?: boolean;
      attachmentsEnabled?: boolean;
    };
  },
): Promise<{
  response: OrgSettingsResponse;
  changedKeys: string[];
}> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, settings: true },
  });

  if (!org) {
    throw new TicketError("Organization not found", 404);
  }

  const current = parseOrgSettings(org.settings);
  const next: OrgSettings = {
    featureFlags: { ...current.featureFlags },
  };

  if (current.timezone) {
    next.timezone = current.timezone;
  }

  const changedKeys: string[] = [];

  if (patch.timezone !== undefined && patch.timezone !== current.timezone) {
    next.timezone = patch.timezone;
    changedKeys.push("timezone");
  }

  if (patch.featureFlags?.commentsEnabled !== undefined) {
    if (
      patch.featureFlags.commentsEnabled !== current.featureFlags.commentsEnabled
    ) {
      next.featureFlags.commentsEnabled = patch.featureFlags.commentsEnabled;
      changedKeys.push("featureFlags.commentsEnabled");
    }
  }

  if (patch.featureFlags?.attachmentsEnabled !== undefined) {
    if (
      patch.featureFlags.attachmentsEnabled !==
      current.featureFlags.attachmentsEnabled
    ) {
      next.featureFlags.attachmentsEnabled =
        patch.featureFlags.attachmentsEnabled;
      changedKeys.push("featureFlags.attachmentsEnabled");
    }
  }

  if (changedKeys.length === 0) {
    return {
      response: { orgId: org.id, settings: current },
      changedKeys,
    };
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: { settings: next },
    select: { id: true, settings: true },
  });

  return {
    response: {
      orgId: updated.id,
      settings: parseOrgSettings(updated.settings),
    },
    changedKeys,
  };
}

export async function assertCommentsEnabled(orgId: string): Promise<void> {
  const { settings } = await getOrgSettings(orgId);
  if (!settings.featureFlags.commentsEnabled) {
    throw new TicketError(
      "Comments are disabled for this organization",
      403,
      "feature_disabled",
    );
  }
}

export async function assertAttachmentsEnabled(orgId: string): Promise<void> {
  const { settings } = await getOrgSettings(orgId);
  if (!settings.featureFlags.attachmentsEnabled) {
    throw new TicketError(
      "Attachments are disabled for this organization",
      403,
      "feature_disabled",
    );
  }
}
