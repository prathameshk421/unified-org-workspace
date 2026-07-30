import { z } from "zod";

export const createShareSchema = z.object({
  recipientUserId: z.string().min(1),
  partnerOrgSlug: z.string().trim().min(1),
});

export const ticketIdParamSchema = z.object({
  ticketId: z.string().min(1),
});

export const prIdParamSchema = z.object({
  prId: z.string().min(1),
});

export const shareIdParamSchema = z.object({
  shareId: z.string().min(1),
});
