import { Router, type Router as RouterType } from "express";
import { authRouter } from "./auth/routes.js";
import { rbacProbeRouter } from "./rbac-probe.js";

const router: RouterType = Router();

router.use("/auth", authRouter);
router.use("/rbac", rbacProbeRouter);

export { router as identityRouter };
