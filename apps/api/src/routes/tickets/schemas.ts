import { TicketStatus } from "@unified/types";
import { z } from "zod";

const ticketStatusSchema = z.enum([
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
]);

export const createTicketSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
  assigneeId: z.string().cuid().nullable().optional(),
});

export const updateTicketSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    assigneeId: z.string().cuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.assigneeId !== undefined,
    { message: "At least one field is required" },
  );

export const updateTicketStatusSchema = z.object({
  status: ticketStatusSchema,
});

export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
});
