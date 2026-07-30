import type { TicketComment } from "@prisma/client";
import { OrgRole, type TicketCommentResponse } from "@unified/types";
import {
  ResourceAccessError,
  resolveTicketAccess,
} from "../../lib/resource-access.js";
import { prisma } from "../../lib/prisma.js";
import { assertCommentsEnabled } from "../org-settings/service.js";
import { TicketError, getOrgTicketOrThrow } from "./service.js";

export function toCommentResponse(
  comment: TicketComment,
): TicketCommentResponse {
  return {
    id: comment.id,
    ticketId: comment.ticketId,
    orgId: comment.orgId,
    authorId: comment.authorId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

export async function getOrgCommentOrThrow(
  commentId: string,
  ticketId: string,
  orgId: string,
): Promise<TicketComment> {
  const comment = await prisma.ticketComment.findFirst({
    where: { id: commentId, ticketId, orgId },
  });

  if (!comment) {
    throw new TicketError("Comment not found", 404);
  }

  return comment;
}

export function assertCanUpdateComment(
  comment: TicketComment,
  userId: string,
  role: string,
): void {
  if (role === OrgRole.CROSS_ORG_GUEST) {
    throw new TicketError("Insufficient role", 403, "insufficient_role");
  }

  if (comment.authorId !== userId) {
    throw new TicketError(
      "Only the comment author can edit this comment",
      403,
      "not_comment_author",
    );
  }
}

export function assertCanDeleteComment(
  comment: TicketComment,
  userId: string,
  role: string,
): void {
  if (role === OrgRole.CROSS_ORG_GUEST) {
    throw new TicketError("Insufficient role", 403, "insufficient_role");
  }

  if (comment.authorId === userId || role === OrgRole.ORG_ADMIN) {
    return;
  }

  throw new TicketError(
    "Only the comment author or an org admin can delete this comment",
    403,
    "not_comment_author",
  );
}

export async function listComments(input: {
  ticketId: string;
  userId: string;
  role: string | null;
  sessionOrgId: string;
}): Promise<TicketCommentResponse[]> {
  const { ticket } = await resolveTicketAccess({
    userId: input.userId,
    role: input.role as OrgRole | null,
    sessionOrgId: input.sessionOrgId,
    ticketId: input.ticketId,
  });

  const comments = await prisma.ticketComment.findMany({
    where: { ticketId: ticket.id, orgId: ticket.orgId },
    orderBy: { createdAt: "asc" },
  });

  return comments.map(toCommentResponse);
}

export async function createComment(input: {
  ticketId: string;
  userId: string;
  role: string | null;
  sessionOrgId: string;
  body: string;
}): Promise<TicketCommentResponse> {
  const { ticket } = await resolveTicketAccess({
    userId: input.userId,
    role: input.role as OrgRole | null,
    sessionOrgId: input.sessionOrgId,
    ticketId: input.ticketId,
  });

  // Owner-org feature flag on shared path
  await assertCommentsEnabled(ticket.orgId);

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId: ticket.id,
      orgId: ticket.orgId,
      authorId: input.userId,
      body: input.body,
    },
  });

  return toCommentResponse(comment);
}

export async function updateComment(input: {
  commentId: string;
  ticketId: string;
  orgId: string;
  userId: string;
  role: string;
  body: string;
}): Promise<TicketCommentResponse> {
  await getOrgTicketOrThrow(input.ticketId, input.orgId);
  await assertCommentsEnabled(input.orgId);

  const existing = await getOrgCommentOrThrow(
    input.commentId,
    input.ticketId,
    input.orgId,
  );
  assertCanUpdateComment(existing, input.userId, input.role);

  const comment = await prisma.ticketComment.update({
    where: { id: existing.id },
    data: { body: input.body },
  });

  return toCommentResponse(comment);
}

export async function deleteComment(input: {
  commentId: string;
  ticketId: string;
  orgId: string;
  userId: string;
  role: string;
}): Promise<TicketComment> {
  await getOrgTicketOrThrow(input.ticketId, input.orgId);

  const existing = await getOrgCommentOrThrow(
    input.commentId,
    input.ticketId,
    input.orgId,
  );
  assertCanDeleteComment(existing, input.userId, input.role);

  await prisma.ticketComment.delete({
    where: { id: existing.id },
  });

  return existing;
}

export { ResourceAccessError };
