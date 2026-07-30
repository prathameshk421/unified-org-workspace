import { Router, type Router as RouterType } from "express";
import { PR_MUTATOR_ROLES } from "@unified/types";
import {
  requireAuth,
  requireJsonContentType,
  requireOrgAccess,
  requireRole,
} from "../identity/auth/middleware.js";
import {
  createPrHandler,
  getPrHandler,
  getVersionDiffHandler,
  listOrgMembersHandler,
  listPrsHandler,
  listVersionsHandler,
  submitReviewHandler,
  transitionPrHandler,
  updatePrHandler,
} from "./handlers.js";

const prMutatorMiddleware = [
  requireAuth,
  requireOrgAccess,
  requireRole(...PR_MUTATOR_ROLES),
] as const;

const prsRoutes: RouterType = Router();

prsRoutes.post("/", requireJsonContentType, ...prMutatorMiddleware, createPrHandler);
prsRoutes.get("/", ...prMutatorMiddleware, listPrsHandler);
prsRoutes.get("/:id/versions/:versionNumber/diff", ...prMutatorMiddleware, getVersionDiffHandler);
prsRoutes.get("/:id/versions", ...prMutatorMiddleware, listVersionsHandler);
prsRoutes.post(
  "/:id/transition",
  requireJsonContentType,
  ...prMutatorMiddleware,
  transitionPrHandler,
);
prsRoutes.post("/:id/reviews", requireJsonContentType, ...prMutatorMiddleware, submitReviewHandler);
prsRoutes.get("/:id", ...prMutatorMiddleware, getPrHandler);
prsRoutes.patch("/:id", requireJsonContentType, ...prMutatorMiddleware, updatePrHandler);

const orgRoutes: RouterType = Router();
orgRoutes.get("/members", ...prMutatorMiddleware, listOrgMembersHandler);

export const prsRouter: RouterType = Router().use("/prs", prsRoutes);
export const orgRouter: RouterType = Router().use("/org", orgRoutes);
