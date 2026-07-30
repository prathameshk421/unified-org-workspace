import { Router, type Router as RouterType } from "express";
import { PR_MUTATOR_ROLES } from "@unified/types";
import {
  requireAuth,
  requireJsonContentType,
  requireOrgAccess,
  requireOrgAccessForResource,
  requireRole,
} from "../identity/auth/middleware.js";
import { registerPrCommentRoutes } from "./comments-routes.js";
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

/** Share-capable reads: any org member + resolvePrAccess in handler. */
const prShareCapableRead = [requireAuth, requireOrgAccessForResource] as const;

const prsRoutes: RouterType = Router();

registerPrCommentRoutes(prsRoutes);

prsRoutes.post("/", requireJsonContentType, ...prMutatorMiddleware, createPrHandler);
prsRoutes.get("/", ...prMutatorMiddleware, listPrsHandler);
prsRoutes.get(
  "/:id/versions/:versionNumber/diff",
  ...prShareCapableRead,
  getVersionDiffHandler,
);
prsRoutes.get("/:id/versions", ...prShareCapableRead, listVersionsHandler);
prsRoutes.post(
  "/:id/transition",
  requireJsonContentType,
  ...prMutatorMiddleware,
  transitionPrHandler,
);
prsRoutes.post(
  "/:id/reviews",
  requireJsonContentType,
  ...prMutatorMiddleware,
  submitReviewHandler,
);
prsRoutes.get("/:id", ...prShareCapableRead, getPrHandler);
prsRoutes.patch("/:id", requireJsonContentType, ...prMutatorMiddleware, updatePrHandler);

const orgRoutes: RouterType = Router();
orgRoutes.get("/members", ...prMutatorMiddleware, listOrgMembersHandler);

export const prsRouter: RouterType = Router().use("/prs", prsRoutes);
export const orgRouter: RouterType = Router().use("/org", orgRoutes);
