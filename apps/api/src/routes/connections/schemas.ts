import { z } from "zod";

export const createConnectionSchema = z.object({
  partnerOrgSlug: z.string().trim().min(1).max(64),
});

export const connectionIdParamSchema = z.object({
  id: z.string().min(1),
});

export const recipientsQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
