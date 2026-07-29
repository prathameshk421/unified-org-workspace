import { Router, type Router as RouterType } from "express";
import { authRouter } from "./auth/routes.js";

const router: RouterType = Router();

router.use("/auth", authRouter);

export { router as identityRouter };
