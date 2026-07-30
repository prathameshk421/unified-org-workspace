import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from "express";
import { ZodError } from "zod";
import { AuditAction, OrgRole, TICKET_MUTATOR_ROLES } from "@unified/types";
import { record } from "../../lib/audit-log.js";
import { queueAudit } from "../../middleware/audit-mutations.js";
import {
  requireAuth,
  requireJsonContentType,
  requireOrgAccess,
  requirePlatformAdmin,
  requireRole,
} from "../identity/auth/middleware.js";
import {
  connectionIdParamSchema,
  createConnectionSchema,
  recipientsQuerySchema,
} from "./schemas.js";
import {
  ConnectionError,
  acceptConnection,
  listAllConnections,
  listConnections,
  listRecipients,
  rejectConnection,
  requestConnection,
  revokeConnection,
} from "./service.js";

function handleError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.flatten().fieldErrors,
    });
    return;
  }

  if (error instanceof ConnectionError) {
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

const orgAdminStack = [
  requireAuth,
  requireOrgAccess,
  requireRole(OrgRole.ORG_ADMIN),
] as const;

const connectionsRoutes: RouterType = Router();

connectionsRoutes.get(
  "/",
  ...orgAdminStack,
  async (req: Request, res: Response) => {
    try {
      const connections = await listConnections(req.orgId!);
      res.json({ connections });
    } catch (error) {
      handleError(res, error);
    }
  },
);

connectionsRoutes.post(
  "/",
  ...orgAdminStack,
  requireJsonContentType,
  async (req: Request, res: Response) => {
    try {
      const body = createConnectionSchema.parse(req.body);
      const { connection, created } = await requestConnection({
        sessionOrgId: req.orgId!,
        userId: req.auth!.userId,
        partnerOrgSlug: body.partnerOrgSlug,
      });

      queueAudit(req, res, {
        action: AuditAction.CONNECTION_REQUEST,
        entityType: "OrgConnection",
        entityId: connection.id,
        metadata: {
          partnerOrgSlug: body.partnerOrgSlug,
          partnerOrgId: connection.partnerOrg.orgId,
          reRequest: !created,
        },
      });

      res.status(created ? 201 : 200).json(connection);
    } catch (error) {
      handleError(res, error);
    }
  },
);

connectionsRoutes.post(
  "/:id/accept",
  ...orgAdminStack,
  async (req: Request, res: Response) => {
    try {
      const { id } = connectionIdParamSchema.parse(req.params);
      const connection = await acceptConnection({
        connectionId: id,
        sessionOrgId: req.orgId!,
        userId: req.auth!.userId,
      });

      queueAudit(req, res, {
        action: AuditAction.CONNECTION_ACCEPT,
        entityType: "OrgConnection",
        entityId: connection.id,
        metadata: { partnerOrgId: connection.partnerOrg.orgId },
      });

      res.json(connection);
    } catch (error) {
      handleError(res, error);
    }
  },
);

connectionsRoutes.post(
  "/:id/reject",
  ...orgAdminStack,
  async (req: Request, res: Response) => {
    try {
      const { id } = connectionIdParamSchema.parse(req.params);
      const connection = await rejectConnection({
        connectionId: id,
        sessionOrgId: req.orgId!,
        userId: req.auth!.userId,
      });

      queueAudit(req, res, {
        action: AuditAction.CONNECTION_REJECT,
        entityType: "OrgConnection",
        entityId: connection.id,
        metadata: { partnerOrgId: connection.partnerOrg.orgId },
      });

      res.json(connection);
    } catch (error) {
      handleError(res, error);
    }
  },
);

connectionsRoutes.post(
  "/:id/revoke",
  ...orgAdminStack,
  async (req: Request, res: Response) => {
    try {
      const { id } = connectionIdParamSchema.parse(req.params);
      const { connection, revokedGrantCount } = await revokeConnection({
        connectionId: id,
        sessionOrgId: req.orgId!,
        userId: req.auth!.userId,
      });

      const partnerOrg =
        connection.orgAId === req.orgId! ? connection.orgB : connection.orgA;

      queueAudit(req, res, {
        action: AuditAction.CONNECTION_REVOKE,
        entityType: "OrgConnection",
        entityId: connection.id,
        metadata: {
          partnerOrgId: partnerOrg.id,
          revokedGrantCount,
        },
      });

      res.json({
        id: connection.id,
        status: connection.status,
        partnerOrg: {
          orgId: partnerOrg.id,
          orgName: partnerOrg.name,
          orgSlug: partnerOrg.slug,
        },
        requestedById: connection.requestedById,
        respondedById: connection.respondedById,
        createdAt: connection.createdAt.toISOString(),
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

/** Recipients picker — mutator/admin of a side; no email in response. */
connectionsRoutes.get(
  "/:id/recipients",
  requireAuth,
  requireOrgAccess,
  requireRole(...TICKET_MUTATOR_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { id } = connectionIdParamSchema.parse(req.params);
      const query = recipientsQuerySchema.parse(req.query);
      const result = await listRecipients({
        connectionId: id,
        sessionOrgId: req.orgId!,
        query: query.query,
        limit: query.limit,
        offset: query.offset,
      });

      // GET requests are outside the auditMutations flush cycle — record directly.
      await record({
        orgId: req.orgId!,
        userId: req.auth!.userId,
        action: "connection.recipients_lookup",
        entityType: "OrgConnection",
        entityId: id,
        metadata: {
          query: query.query ?? null,
          resultCount: result.recipients.length,
        },
      });

      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  },
);

export const connectionsRouter: RouterType = Router().use(
  "/connections",
  connectionsRoutes,
);

const platformConnectionsRoutes: RouterType = Router();

platformConnectionsRoutes.get(
  "/",
  requireAuth,
  requirePlatformAdmin,
  async (_req: Request, res: Response) => {
    try {
      const connections = await listAllConnections();
      res.json({ connections });
    } catch (error) {
      handleError(res, error);
    }
  },
);

platformConnectionsRoutes.post(
  "/:id/force-revoke",
  requireAuth,
  requirePlatformAdmin,
  async (req: Request, res: Response) => {
    try {
      const { id } = connectionIdParamSchema.parse(req.params);
      const { connection, revokedGrantCount } = await revokeConnection({
        connectionId: id,
        sessionOrgId: null,
        userId: req.auth!.userId,
        platformOverride: true,
      });

      // Platform admin may have no activeOrg — attribute to orgA for append-only trail.
      queueAudit(req, res, {
        action: AuditAction.CONNECTION_FORCE_REVOKE,
        orgId: connection.orgAId,
        entityType: "OrgConnection",
        entityId: connection.id,
        metadata: {
          orgAId: connection.orgAId,
          orgBId: connection.orgBId,
          revokedGrantCount,
        },
      });

      res.json({
        id: connection.id,
        status: connection.status,
        orgA: {
          orgId: connection.orgA.id,
          orgName: connection.orgA.name,
          orgSlug: connection.orgA.slug,
        },
        orgB: {
          orgId: connection.orgB.id,
          orgName: connection.orgB.name,
          orgSlug: connection.orgB.slug,
        },
        requestedById: connection.requestedById,
        respondedById: connection.respondedById,
        createdAt: connection.createdAt.toISOString(),
        revokedGrantCount,
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

export const platformConnectionsRouter: RouterType = Router().use(
  "/platform/connections",
  platformConnectionsRoutes,
);
