import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from "express";
import { ZodError } from "zod";
import {
  AuditAction,
  OrgRole,
  PR_MUTATOR_ROLES,
  TICKET_MUTATOR_ROLES,
} from "@unified/types";
import { HttpError } from "../prs/errors.js";
import { TicketError } from "../tickets/service.js";
import { queueAudit } from "../../middleware/audit-mutations.js";
import {
  requireAuth,
  requireJsonContentType,
  requireOrgAccess,
  requireRole,
} from "../identity/auth/middleware.js";
import {
  createShareSchema,
  prIdParamSchema,
  shareIdParamSchema,
  ticketIdParamSchema,
} from "./schemas.js";
import {
  ShareError,
  createPrShare,
  createTicketShare,
  listInboundShares,
  listOutboundShares,
  listPrShares,
  listSharedPrs,
  listSharedTickets,
  listTicketShares,
  revokeShare,
} from "./service.js";

const ticketMutatorMiddleware = [
  requireAuth,
  requireOrgAccess,
  requireRole(...TICKET_MUTATOR_ROLES),
] as const;

const prMutatorMiddleware = [
  requireAuth,
  requireOrgAccess,
  requireRole(...PR_MUTATOR_ROLES),
] as const;

const anyMemberMiddleware = [requireAuth, requireOrgAccess] as const;

function handleShareError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.flatten().fieldErrors,
    });
    return;
  }

  if (error instanceof ShareError) {
    const body: { error: string; code?: string } = { error: error.message };
    if (error.code) {
      body.code = error.code;
    }
    res.status(error.statusCode).json(body);
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

const router: RouterType = Router();

router.post(
  "/tickets/:ticketId/shares",
  ...ticketMutatorMiddleware,
  requireJsonContentType,
  async (req: Request, res: Response) => {
    try {
      const { ticketId } = ticketIdParamSchema.parse(req.params);
      const body = createShareSchema.parse(req.body);

      const grant = await createTicketShare({
        ticketId,
        sessionOrgId: req.orgId!,
        actorUserId: req.auth!.userId,
        recipientUserId: body.recipientUserId,
        partnerOrgSlug: body.partnerOrgSlug,
      });

      queueAudit(req, res, {
        action: AuditAction.SHARE_CREATE,
        entityType: "ShareGrant",
        entityId: grant.id,
        metadata: {
          resourceType: grant.resourceType,
          resourceId: grant.resourceId,
          granteeOrgId: grant.granteeOrgId,
          grantedToUserId: grant.grantedToUserId,
        },
      });

      res.status(201).json(grant);
    } catch (error) {
      handleShareError(res, error);
    }
  },
);

router.get(
  "/tickets/:ticketId/shares",
  ...ticketMutatorMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { ticketId } = ticketIdParamSchema.parse(req.params);
      const grants = await listTicketShares(ticketId, req.orgId!);
      res.json({ shares: grants });
    } catch (error) {
      handleShareError(res, error);
    }
  },
);

router.post(
  "/prs/:prId/shares",
  ...prMutatorMiddleware,
  requireJsonContentType,
  async (req: Request, res: Response) => {
    try {
      const { prId } = prIdParamSchema.parse(req.params);
      const body = createShareSchema.parse(req.body);

      const grant = await createPrShare({
        prId,
        sessionOrgId: req.orgId!,
        actorUserId: req.auth!.userId,
        recipientUserId: body.recipientUserId,
        partnerOrgSlug: body.partnerOrgSlug,
      });

      queueAudit(req, res, {
        action: AuditAction.SHARE_CREATE,
        entityType: "ShareGrant",
        entityId: grant.id,
        metadata: {
          resourceType: grant.resourceType,
          resourceId: grant.resourceId,
          granteeOrgId: grant.granteeOrgId,
          grantedToUserId: grant.grantedToUserId,
        },
      });

      res.status(201).json(grant);
    } catch (error) {
      handleShareError(res, error);
    }
  },
);

router.get(
  "/prs/:prId/shares",
  ...prMutatorMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { prId } = prIdParamSchema.parse(req.params);
      const grants = await listPrShares(prId, req.orgId!);
      res.json({ shares: grants });
    } catch (error) {
      handleShareError(res, error);
    }
  },
);

router.get(
  "/shares/outbound",
  requireAuth,
  requireOrgAccess,
  requireRole(OrgRole.ORG_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const grants = await listOutboundShares(req.orgId!);
      res.json({ shares: grants });
    } catch (error) {
      handleShareError(res, error);
    }
  },
);

router.get(
  "/shares/inbound",
  ...anyMemberMiddleware,
  async (req: Request, res: Response) => {
    try {
      const grants = await listInboundShares({
        sessionOrgId: req.orgId!,
        userId: req.auth!.userId,
        isAdmin: req.auth!.role === OrgRole.ORG_ADMIN,
      });
      res.json({ shares: grants });
    } catch (error) {
      handleShareError(res, error);
    }
  },
);

router.delete(
  "/shares/:shareId",
  ...anyMemberMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { shareId } = shareIdParamSchema.parse(req.params);
      const { grant, revokedBy } = await revokeShare({
        shareId,
        userId: req.auth!.userId,
        role: req.auth!.role,
        sessionOrgId: req.orgId!,
      });

      queueAudit(req, res, {
        action: AuditAction.SHARE_REVOKE,
        entityType: "ShareGrant",
        entityId: grant.id,
        metadata: {
          resourceType: grant.resourceType,
          resourceId: grant.resourceId,
          revokedBy,
        },
      });

      res.json(grant);
    } catch (error) {
      handleShareError(res, error);
    }
  },
);

router.get(
  "/shared/tickets",
  ...anyMemberMiddleware,
  async (req: Request, res: Response) => {
    try {
      const tickets = await listSharedTickets(req.auth!.userId, req.orgId!);
      res.json({ tickets });
    } catch (error) {
      handleShareError(res, error);
    }
  },
);

router.get(
  "/shared/prs",
  ...anyMemberMiddleware,
  async (req: Request, res: Response) => {
    try {
      const prs = await listSharedPrs(req.auth!.userId, req.orgId!);
      res.json({ prs });
    } catch (error) {
      handleShareError(res, error);
    }
  },
);

export { router as sharesRouter };
