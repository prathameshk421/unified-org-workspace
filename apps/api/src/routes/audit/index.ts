import { Router, type Router as RouterType } from "express";
import { AUDIT_VIEWER_ROLES } from "@unified/types";
import { requireAuth, requireOrgAccess, requireRole } from "../identity/auth/middleware.js";
import { exportAuditHandler, listAuditHandler } from "./handlers.js";

const router: RouterType = Router();

router.get(
  "/",
  requireAuth,
  requireOrgAccess,
  requireRole(...AUDIT_VIEWER_ROLES),
  listAuditHandler,
);

router.get(
  "/export",
  requireAuth,
  requireOrgAccess,
  requireRole(...AUDIT_VIEWER_ROLES),
  exportAuditHandler,
);

export const auditRouter = router;
