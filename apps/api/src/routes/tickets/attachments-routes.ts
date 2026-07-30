import type { Request, Response, Router as RouterType } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { z } from "zod";
import {
  ATTACHMENT_DELETE_ROLES,
  ATTACHMENT_UPLOAD_ROLES,
  AuditAction,
} from "@unified/types";
import {
  AttachmentStorageError,
  sanitizeFileName,
} from "../../lib/attachments-storage.js";
import { ResourceAccessError } from "../../lib/resource-access.js";
import { queueAudit } from "../../middleware/audit-mutations.js";
import { singleFileUpload } from "../../middleware/upload.js";
import {
  requireAuth,
  requireOrgAccess,
  requireOrgAccessForResource,
  requireRole,
} from "../identity/auth/middleware.js";
import {
  createAttachment,
  deleteAttachment,
  getAttachmentFile,
  getAttachmentMeta,
  listAttachments,
  toAttachmentResponse,
} from "./attachments-service.js";
import {
  TicketError,
  getOrgTicketOrThrow,
  truncateForAudit,
} from "./service.js";

const ticketIdParamSchema = z.object({
  ticketId: z.string().min(1),
});

const attachmentIdParamSchema = z.object({
  ticketId: z.string().min(1),
  attachmentId: z.string().min(1),
});

function contentDisposition(fileName: string): string {
  const sanitized = sanitizeFileName(fileName);
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

export function registerAttachmentRoutes(router: RouterType): void {
  function handleError(res: Response, error: unknown): void {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation failed",
        details: error.flatten().fieldErrors,
      });
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: "File too large",
          code: "file_too_large",
        });
        return;
      }
      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        res.status(400).json({
          error: "Expected single file field named file",
          code: "invalid_upload",
        });
        return;
      }
      res.status(400).json({
        error: error.message,
        code: "invalid_upload",
      });
      return;
    }

    if (error instanceof AttachmentStorageError) {
      if (error.code === "file_missing") {
        res.status(404).json({ error: "Attachment not found" });
        return;
      }
      res.status(400).json({ error: error.message, code: error.code });
      return;
    }

    if (error instanceof ResourceAccessError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    if (error instanceof TicketError) {
      const body: { error: string; code?: string } = { error: error.message };
      if (error.code) {
        body.code = error.code;
      }
      res.status(error.statusCode).json(body);
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }

  // List / meta / download: share-capable (ForResource + resolveTicketAccess)
  router.get(
    "/tickets/:ticketId/attachments",
    requireAuth,
    requireOrgAccessForResource,
    async (req: Request, res: Response) => {
      try {
        const { ticketId } = ticketIdParamSchema.parse(req.params);
        const attachments = await listAttachments({
          ticketId,
          userId: req.auth!.userId,
          role: req.auth!.role,
          sessionOrgId: req.orgId!,
        });
        res.json({ attachments });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    "/tickets/:ticketId/attachments",
    requireAuth,
    requireOrgAccess,
    requireRole(...ATTACHMENT_UPLOAD_ROLES),
    // Strict owner-org check before multipart parse / missing-file 400 so
    // share-only holders get 404 (not 400) on upload attempts.
    async (req: Request, res: Response, next) => {
      try {
        const { ticketId } = ticketIdParamSchema.parse(req.params);
        await getOrgTicketOrThrow(ticketId, req.orgId!);
        next();
      } catch (error) {
        handleError(res, error);
      }
    },
    (req: Request, res: Response, next) => {
      singleFileUpload(req, res, (error) => {
        if (error) {
          handleError(res, error);
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const { ticketId } = ticketIdParamSchema.parse(req.params);
        const file = req.file;

        if (!file) {
          throw new TicketError("Missing file upload", 400, "missing_file");
        }

        const attachment = await createAttachment({
          ticketId,
          orgId: req.orgId!,
          uploadedById: req.auth!.userId,
          originalFileName: file.originalname || "file",
          buffer: file.buffer,
        });

        queueAudit(req, res, {
          action: AuditAction.ATTACHMENT_UPLOAD,
          entityType: "TicketAttachment",
          entityId: attachment.id,
          metadata: {
            ticketId: attachment.ticketId,
            fileName: truncateForAudit(attachment.fileName),
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          },
        });

        res.status(201).json(attachment);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    "/tickets/:ticketId/attachments/:attachmentId",
    requireAuth,
    requireOrgAccessForResource,
    async (req: Request, res: Response) => {
      try {
        const params = attachmentIdParamSchema.parse(req.params);
        const attachment = await getAttachmentMeta({
          attachmentId: params.attachmentId,
          ticketId: params.ticketId,
          userId: req.auth!.userId,
          role: req.auth!.role,
          sessionOrgId: req.orgId!,
        });
        res.json(toAttachmentResponse(attachment));
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    "/tickets/:ticketId/attachments/:attachmentId/download",
    requireAuth,
    requireOrgAccessForResource,
    async (req: Request, res: Response) => {
      try {
        const params = attachmentIdParamSchema.parse(req.params);
        const { attachment, buffer } = await getAttachmentFile({
          attachmentId: params.attachmentId,
          ticketId: params.ticketId,
          userId: req.auth!.userId,
          role: req.auth!.role,
          sessionOrgId: req.orgId!,
        });

        res.setHeader("Content-Type", attachment.mimeType);
        res.setHeader(
          "Content-Disposition",
          contentDisposition(attachment.fileName),
        );
        res.setHeader("Content-Length", String(attachment.sizeBytes));
        res.status(200).send(buffer);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.delete(
    "/tickets/:ticketId/attachments/:attachmentId",
    requireAuth,
    requireOrgAccess,
    requireRole(...ATTACHMENT_DELETE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const params = attachmentIdParamSchema.parse(req.params);
        const attachment = await deleteAttachment({
          attachmentId: params.attachmentId,
          ticketId: params.ticketId,
          orgId: req.orgId!,
          userId: req.auth!.userId,
          role: req.auth!.role!,
        });

        queueAudit(req, res, {
          action: AuditAction.ATTACHMENT_DELETE,
          entityType: "TicketAttachment",
          entityId: attachment.id,
          metadata: {
            ticketId: attachment.ticketId,
            fileName: truncateForAudit(attachment.fileName),
          },
        });

        res.status(204).send();
      } catch (error) {
        handleError(res, error);
      }
    },
  );
}
