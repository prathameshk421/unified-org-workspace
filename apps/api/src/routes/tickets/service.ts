import type { Ticket } from "@prisma/client";
import type { TicketResponse, TicketStatus } from "@unified/types";
import { prisma } from "../../lib/prisma.js";
import { isValidStatusTransition } from "./transitions.js";

export class TicketError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TicketError";
  }
}

export function toTicketResponse(ticket: Ticket): TicketResponse {
  return {
    id: ticket.id,
    orgId: ticket.orgId,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status as TicketStatus,
    createdById: ticket.createdById,
    assigneeId: ticket.assigneeId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export async function getOrgTicketOrThrow(
  id: string,
  orgId: string,
): Promise<Ticket> {
  const ticket = await prisma.ticket.findFirst({
    where: { id, orgId },
  });

  if (!ticket) {
    throw new TicketError("Ticket not found", 404);
  }

  return ticket;
}

async function validateAssignee(
  orgId: string,
  assigneeId: string | null | undefined,
): Promise<void> {
  if (assigneeId == null) {
    return;
  }

  const membership = await prisma.orgMembership.findUnique({
    where: {
      userId_orgId: { userId: assigneeId, orgId },
    },
  });

  if (!membership?.acceptedAt) {
    throw new TicketError(
      "Assignee is not a member of this organization",
      400,
      "invalid_assignee",
    );
  }
}

export async function listTickets(
  orgId: string,
  status?: TicketStatus,
): Promise<TicketResponse[]> {
  const tickets = await prisma.ticket.findMany({
    where: {
      orgId,
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return tickets.map(toTicketResponse);
}

export async function createTicket(input: {
  orgId: string;
  createdById: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
}): Promise<TicketResponse> {
  await validateAssignee(input.orgId, input.assigneeId);

  const ticket = await prisma.ticket.create({
    data: {
      orgId: input.orgId,
      createdById: input.createdById,
      title: input.title,
      description: input.description ?? "",
      assigneeId: input.assigneeId ?? null,
    },
  });

  return toTicketResponse(ticket);
}

export async function updateTicket(
  id: string,
  orgId: string,
  input: {
    title?: string;
    description?: string;
    assigneeId?: string | null;
  },
): Promise<{ ticket: TicketResponse; changedFields: string[] }> {
  const existing = await getOrgTicketOrThrow(id, orgId);

  if (input.assigneeId !== undefined) {
    await validateAssignee(orgId, input.assigneeId);
  }

  const data: {
    title?: string;
    description?: string;
    assigneeId?: string | null;
  } = {};

  const changedFields: string[] = [];

  if (input.title !== undefined && input.title !== existing.title) {
    data.title = input.title;
    changedFields.push("title");
  }

  if (
    input.description !== undefined &&
    input.description !== existing.description
  ) {
    data.description = input.description;
    changedFields.push("description");
  }

  if (
    input.assigneeId !== undefined &&
    input.assigneeId !== existing.assigneeId
  ) {
    data.assigneeId = input.assigneeId;
    changedFields.push("assigneeId");
  }

  if (changedFields.length === 0) {
    return { ticket: toTicketResponse(existing), changedFields };
  }

  const ticket = await prisma.ticket.update({
    where: { id: existing.id },
    data,
  });

  return { ticket: toTicketResponse(ticket), changedFields };
}

export async function updateTicketStatus(
  id: string,
  orgId: string,
  status: TicketStatus,
): Promise<{ ticket: TicketResponse; from: TicketStatus; to: TicketStatus }> {
  const existing = await getOrgTicketOrThrow(id, orgId);
  const from = existing.status as TicketStatus;

  if (from === status) {
    return { ticket: toTicketResponse(existing), from, to: status };
  }

  if (!isValidStatusTransition(from, status)) {
    throw new TicketError(
      `Cannot transition from ${from} to ${status}`,
      400,
      "invalid_status_transition",
    );
  }

  const ticket = await prisma.ticket.update({
    where: { id: existing.id },
    data: { status },
  });

  return { ticket: toTicketResponse(ticket), from, to: status };
}

export async function deleteTicket(id: string, orgId: string): Promise<Ticket> {
  const existing = await getOrgTicketOrThrow(id, orgId);

  const { cleanupTicketAttachmentFiles } = await import(
    "./attachments-service.js"
  );
  await cleanupTicketAttachmentFiles(existing.id, orgId);

  await prisma.ticket.delete({
    where: { id: existing.id },
  });

  return existing;
}

export function truncateForAudit(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}
