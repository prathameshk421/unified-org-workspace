import {
  type Request,
  type Response,
  type Router as RouterType,
} from "express";
import { ZodError } from "zod";
import {
  AuditAction,
  COMMENT_DELETE_ROLES,
  COMMENT_UPDATE_ROLES,
} from "@unified/types";
import { ResourceAccessError } from "../../lib/resource-access.js";
import { queueAudit } from "../../middleware/audit-mutations.js";
import {
  requireAuth,
  requireJsonContentType,
  requireOrgAccess,
  requireOrgAccessForResource,
  requireRole,
} from "../identity/auth/middleware.js";
import {
  commentIdParamSchema,
  createTicketCommentSchema,
  ticketIdParamSchema,
  updateTicketCommentSchema,
} from "./comments-schemas.js";
import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
} from "./comments-service.js";
import { TicketError, truncateForAudit } from "./service.js";

export function registerCommentRoutes(router: RouterType): void {
  function handleError(res: Response, error: unknown): void {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation failed",
        details: error.flatten().fieldErrors,
      });
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

  // Read + create: ForResource + resolveTicketAccess (share-capable; drop → 404)
  router.get(
    "/tickets/:ticketId/comments",
    requireAuth,
    requireOrgAccessForResource,
    async (req: Request, res: Response) => {
      try {
        const { ticketId } = ticketIdParamSchema.parse(req.params);
        const comments = await listComments({
          ticketId,
          userId: req.auth!.userId,
          role: req.auth!.role,
          sessionOrgId: req.orgId!,
        });
        res.json({ comments });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    "/tickets/:ticketId/comments",
    requireAuth,
    requireOrgAccessForResource,
    requireJsonContentType,
    async (req: Request, res: Response) => {
      try {
        const { ticketId } = ticketIdParamSchema.parse(req.params);
        const body = createTicketCommentSchema.parse(req.body);
        const comment = await createComment({
          ticketId,
          userId: req.auth!.userId,
          role: req.auth!.role,
          sessionOrgId: req.orgId!,
          body: body.body,
        });

        queueAudit(req, res, {
          action: AuditAction.COMMENT_CREATE,
          entityType: "TicketComment",
          entityId: comment.id,
          metadata: {
            ticketId: comment.ticketId,
            bodyPreview: truncateForAudit(comment.body),
          },
        });

        res.status(201).json(comment);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // Update/delete: mutators + strict getOrgTicketOrThrow
  router.patch(
    "/tickets/:ticketId/comments/:commentId",
    requireAuth,
    requireOrgAccess,
    requireRole(...COMMENT_UPDATE_ROLES),
    requireJsonContentType,
    async (req: Request, res: Response) => {
      try {
        const params = commentIdParamSchema.parse(req.params);
        const body = updateTicketCommentSchema.parse(req.body);
        const comment = await updateComment({
          commentId: params.commentId,
          ticketId: params.ticketId,
          orgId: req.orgId!,
          userId: req.auth!.userId,
          role: req.auth!.role!,
          body: body.body,
        });

        queueAudit(req, res, {
          action: AuditAction.COMMENT_UPDATE,
          entityType: "TicketComment",
          entityId: comment.id,
          metadata: {
            ticketId: comment.ticketId,
            bodyPreview: truncateForAudit(comment.body),
          },
        });

        res.json(comment);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.delete(
    "/tickets/:ticketId/comments/:commentId",
    requireAuth,
    requireOrgAccess,
    requireRole(...COMMENT_DELETE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const params = commentIdParamSchema.parse(req.params);
        const comment = await deleteComment({
          commentId: params.commentId,
          ticketId: params.ticketId,
          orgId: req.orgId!,
          userId: req.auth!.userId,
          role: req.auth!.role!,
        });

        queueAudit(req, res, {
          action: AuditAction.COMMENT_DELETE,
          entityType: "TicketComment",
          entityId: comment.id,
          metadata: {
            ticketId: comment.ticketId,
            bodyPreview: truncateForAudit(comment.body),
          },
        });

        res.status(204).send();
      } catch (error) {
        handleError(res, error);
      }
    },
  );
}
