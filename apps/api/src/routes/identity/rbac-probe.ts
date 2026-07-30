import { Router, type Request, type Response, type Router as RouterType } from "express";
import { OrgRole } from "@unified/types";
import {
  requireAuth,
  requireOrgAccess,
  requirePlatformAdmin,
  requireRole,
} from "./auth/middleware.js";

const router: RouterType = Router();

router.get("/org", requireAuth, requireOrgAccess, (req: Request, res: Response) => {
  res.json({
    orgId: req.orgId,
    role: req.auth!.role,
  });
});

router.get(
  "/admin",
  requireAuth,
  requireOrgAccess,
  requireRole(OrgRole.ORG_ADMIN),
  (_req: Request, res: Response) => {
    res.json({ ok: true, probe: "admin" });
  },
);

router.get(
  "/agent",
  requireAuth,
  requireOrgAccess,
  requireRole(OrgRole.SUPPORT_AGENT, OrgRole.ORG_ADMIN),
  (_req: Request, res: Response) => {
    res.json({ ok: true, probe: "agent" });
  },
);

router.get(
  "/reviewer",
  requireAuth,
  requireOrgAccess,
  requireRole(OrgRole.REVIEWER, OrgRole.ORG_ADMIN),
  (_req: Request, res: Response) => {
    res.json({ ok: true, probe: "reviewer" });
  },
);

router.get("/platform", requireAuth, requirePlatformAdmin, (_req: Request, res: Response) => {
  res.json({ ok: true, probe: "platform" });
});

export { router as rbacProbeRouter };
