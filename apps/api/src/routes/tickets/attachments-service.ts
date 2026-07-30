import type { TicketAttachment } from "@prisma/client";
import { fileTypeFromBuffer } from "file-type";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  OrgRole,
  type AllowedAttachmentMimeType,
  type TicketAttachmentResponse,
} from "@unified/types";
import {
  buildStorageKey,
  deleteAttachmentFile,
  deleteTicketAttachmentFiles,
  readAttachmentFile,
  writeAttachmentFile,
} from "../../lib/attachments-storage.js";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { assertAttachmentsEnabled } from "../org-settings/service.js";
import { TicketError, getOrgTicketOrThrow } from "./service.js";

const ALLOWED_SET = new Set<string>(ALLOWED_ATTACHMENT_MIME_TYPES);

export function toAttachmentResponse(
  attachment: TicketAttachment,
): TicketAttachmentResponse {
  return {
    id: attachment.id,
    ticketId: attachment.ticketId,
    orgId: attachment.orgId,
    uploadedById: attachment.uploadedById,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
  };
}

export async function getOrgAttachmentOrThrow(
  attachmentId: string,
  ticketId: string,
  orgId: string,
): Promise<TicketAttachment> {
  const attachment = await prisma.ticketAttachment.findFirst({
    where: { id: attachmentId, ticketId, orgId },
  });

  if (!attachment) {
    throw new TicketError("Attachment not found", 404);
  }

  return attachment;
}

function isLikelyText(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return true;
  }
  if (buffer.includes(0)) {
    return false;
  }
  try {
    buffer.toString("utf8");
    return true;
  } catch {
    return false;
  }
}

export async function validateMimeType(
  buffer: Buffer,
  originalFileName: string,
): Promise<AllowedAttachmentMimeType> {
  const detected = await fileTypeFromBuffer(buffer);

  if (detected?.mime && ALLOWED_SET.has(detected.mime)) {
    return detected.mime as AllowedAttachmentMimeType;
  }

  if (detected?.mime && !ALLOWED_SET.has(detected.mime)) {
    throw new TicketError("File type is not allowed", 400, "invalid_file_type");
  }

  // text/plain and text/csv often have no magic bytes
  if (isLikelyText(buffer)) {
    const lower = originalFileName.toLowerCase();
    if (lower.endsWith(".csv")) {
      return "text/csv";
    }
    return "text/plain";
  }

  throw new TicketError("File type is not allowed", 400, "invalid_file_type");
}

export function assertCanDeleteAttachment(
  attachment: TicketAttachment,
  userId: string,
  role: string,
): void {
  if (role === OrgRole.CROSS_ORG_GUEST) {
    throw new TicketError("Insufficient role", 403, "insufficient_role");
  }

  if (attachment.uploadedById === userId || role === OrgRole.ORG_ADMIN) {
    return;
  }

  throw new TicketError(
    "Only the uploader or an org admin can delete this attachment",
    403,
    "not_attachment_owner",
  );
}

export async function listAttachments(
  ticketId: string,
  orgId: string,
): Promise<TicketAttachmentResponse[]> {
  await getOrgTicketOrThrow(ticketId, orgId);

  const attachments = await prisma.ticketAttachment.findMany({
    where: { ticketId, orgId },
    orderBy: { createdAt: "asc" },
  });

  return attachments.map(toAttachmentResponse);
}

export async function createAttachment(input: {
  ticketId: string;
  orgId: string;
  uploadedById: string;
  originalFileName: string;
  buffer: Buffer;
}): Promise<TicketAttachmentResponse> {
  await getOrgTicketOrThrow(input.ticketId, input.orgId);
  await assertAttachmentsEnabled(input.orgId);

  if (input.buffer.length > env.attachmentMaxBytes) {
    throw new TicketError("File too large", 413, "file_too_large");
  }

  const mimeType = await validateMimeType(
    input.buffer,
    input.originalFileName,
  );

  const attachment = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM tickets
      WHERE id = ${input.ticketId} AND "orgId" = ${input.orgId}
      FOR UPDATE
    `;

    const count = await tx.ticketAttachment.count({
      where: { ticketId: input.ticketId, orgId: input.orgId },
    });

    if (count >= env.attachmentMaxPerTicket) {
      throw new TicketError(
        "Attachment limit exceeded for this ticket",
        400,
        "attachment_limit_exceeded",
      );
    }

    const created = await tx.ticketAttachment.create({
      data: {
        ticketId: input.ticketId,
        orgId: input.orgId,
        uploadedById: input.uploadedById,
        fileName: input.originalFileName.slice(0, 255),
        mimeType,
        sizeBytes: input.buffer.length,
        storageKey: "pending",
      },
    });

    const storageKey = buildStorageKey(
      input.orgId,
      input.ticketId,
      created.id,
      input.originalFileName,
    );

    return tx.ticketAttachment.update({
      where: { id: created.id },
      data: { storageKey },
    });
  });

  try {
    await writeAttachmentFile(attachment.storageKey, input.buffer);
  } catch (error) {
    await prisma.ticketAttachment
      .delete({ where: { id: attachment.id } })
      .catch(() => undefined);
    throw error;
  }

  return toAttachmentResponse(attachment);
}

export async function getAttachmentFile(input: {
  attachmentId: string;
  ticketId: string;
  orgId: string;
}): Promise<{ attachment: TicketAttachment; buffer: Buffer }> {
  await getOrgTicketOrThrow(input.ticketId, input.orgId);
  const attachment = await getOrgAttachmentOrThrow(
    input.attachmentId,
    input.ticketId,
    input.orgId,
  );
  const buffer = await readAttachmentFile(attachment.storageKey);
  return { attachment, buffer };
}

export async function deleteAttachment(input: {
  attachmentId: string;
  ticketId: string;
  orgId: string;
  userId: string;
  role: string;
}): Promise<TicketAttachment> {
  await getOrgTicketOrThrow(input.ticketId, input.orgId);
  const existing = await getOrgAttachmentOrThrow(
    input.attachmentId,
    input.ticketId,
    input.orgId,
  );
  assertCanDeleteAttachment(existing, input.userId, input.role);

  await deleteAttachmentFile(existing.storageKey);
  await prisma.ticketAttachment.delete({
    where: { id: existing.id },
  });

  return existing;
}

export async function cleanupTicketAttachmentFiles(
  ticketId: string,
  orgId: string,
): Promise<void> {
  const attachments = await prisma.ticketAttachment.findMany({
    where: { ticketId, orgId },
    select: { storageKey: true },
  });

  await deleteTicketAttachmentFiles(
    attachments.map((row) => row.storageKey),
  );
}
