import { z } from "zod";

export const updateOrgSettingsSchema = z
  .object({
    timezone: z.string().trim().min(1).max(64).optional(),
    featureFlags: z
      .object({
        commentsEnabled: z.boolean().optional(),
        attachmentsEnabled: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();
