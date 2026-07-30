import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});
