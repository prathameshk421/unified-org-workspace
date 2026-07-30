import {
  type Request,
  type Response,
  type Router as RouterType,
} from "express";
import { ZodError } from "zod";
import { AuditAction } from "@unified/types";
import {
  ResourceAccessError,
  resolvePrAccess,
} from "../../lib/resource-access.js";
import { queueAudit } from "../../middleware/audit-mutations.js";
import {
  requireAuth,
  requireJsonContentType,
  requireOrgAccess,
} from "../identity/auth/middleware.js";
import { TicketError } from "../tickets/service.js";
import { HttpError } from "./errors.js";
import { createPrCommentSchema, prCommentParamSchema } from "./comments-schemas.js";
import { createPrComment, listPrComments } from "./comments-service.js";

function truncateForAudit(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}

export function registerPrCommentRoutes(router: RouterType): void {
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

    if (error instanceof HttpError) {
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

  // Share-capable: any org member + resolve (view + comment).
  router.get(
    "/:id/comments",
    requireAuth,
    requireOrgAccess,
    async (req: Request, res: Response) => {
      try {
        const { id } = prCommentParamSchema.parse(req.params);
        const resolved = await resolvePrAccess({
          userId: req.auth!.userId,
          role: req.auth!.role,
          sessionOrgId: req.orgId!,
          prId: id,
        });

        const comments = await listPrComments(resolved.pr.id, resolved.pr.orgId);
        res.json({ comments });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    "/:id/comments",
    requireAuth,
    requireOrgAccess,
    requireJsonContentType,
    async (req: Request, res: Response) => {
      try {
        const { id } = prCommentParamSchema.parse(req.params);
        const body = createPrCommentSchema.parse(req.body);
        const resolved = await resolvePrAccess({
          userId: req.auth!.userId,
          role: req.auth!.role,
          sessionOrgId: req.orgId!,
          prId: id,
        });

        // Child tenancy uses owner org; authorOrgId records the commenter's session org for display.
        const comment = await createPrComment({
          pullRequestId: resolved.pr.id,
          orgId: resolved.pr.orgId,
          authorId: req.auth!.userId,
          authorOrgId: req.orgId!,
          body: body.body,
        });

        queueAudit(req, res, {
          action: AuditAction.COMMENT_CREATE,
          entityType: "PrComment",
          entityId: comment.id,
          metadata: {
            pullRequestId: comment.pullRequestId,
            bodyPreview: truncateForAudit(comment.body),
            access: resolved.access,
          },
        });

        res.status(201).json(comment);
      } catch (error) {
        handleError(res, error);
      }
    },
  );
}
