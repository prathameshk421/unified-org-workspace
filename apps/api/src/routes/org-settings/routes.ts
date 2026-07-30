import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from "express";
import { ZodError } from "zod";
import {
  AuditAction,
  ORG_SETTINGS_MUTATOR_ROLES,
  ORG_SETTINGS_READER_ROLES,
} from "@unified/types";
import { queueAudit } from "../../middleware/audit-mutations.js";
import {
  requireAuth,
  requireJsonContentType,
  requireOrgAccess,
  requireRole,
} from "../identity/auth/middleware.js";
import { TicketError } from "../tickets/service.js";
import { updateOrgSettingsSchema } from "./schemas.js";
import { getOrgSettings, updateOrgSettings } from "./service.js";

const router: RouterType = Router();

function handleError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.flatten().fieldErrors,
    });
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

router.get(
  "/org/settings",
  requireAuth,
  requireOrgAccess,
  requireRole(...ORG_SETTINGS_READER_ROLES),
  async (req: Request, res: Response) => {
    try {
      const response = await getOrgSettings(req.orgId!);
      res.json(response);
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.patch(
  "/org/settings",
  requireAuth,
  requireOrgAccess,
  requireRole(...ORG_SETTINGS_MUTATOR_ROLES),
  requireJsonContentType,
  async (req: Request, res: Response) => {
    try {
      const body = updateOrgSettingsSchema.parse(req.body);
      const { response, changedKeys } = await updateOrgSettings(
        req.orgId!,
        body,
      );

      if (changedKeys.length > 0) {
        queueAudit(req, res, {
          action: AuditAction.ORG_SETTINGS_UPDATE,
          entityType: "Organization",
          entityId: req.orgId!,
          metadata: { changedKeys },
        });
      }

      res.json(response);
    } catch (error) {
      handleError(res, error);
    }
  },
);

export { router as orgSettingsRouter };
