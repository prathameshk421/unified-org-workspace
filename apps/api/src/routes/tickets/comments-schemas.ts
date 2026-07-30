import { z } from "zod";

export const createTicketCommentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

export const updateTicketCommentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

export const ticketIdParamSchema = z.object({
  ticketId: z.string().min(1),
});

export const commentIdParamSchema = z.object({
  ticketId: z.string().min(1),
  commentId: z.string().min(1),
});
