import { z } from "zod";

export const createPrCommentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

export const prCommentParamSchema = z.object({
  id: z.string().min(1),
});
