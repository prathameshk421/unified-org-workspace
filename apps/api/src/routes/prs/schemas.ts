import { z } from "zod";
import { PrReviewDecision, PrStatus } from "@unified/types";

/** Absolute ceiling for requiresApprovals (also capped by assigned reviewer count in service). */
export const MAX_REQUIRES_APPROVALS = 50;

const requiresApprovalsSchema = z.number().int().min(1).max(MAX_REQUIRES_APPROVALS);

export const createPrSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).optional(),
  requiresApprovals: requiresApprovalsSchema.optional(),
  reviewerIds: z.array(z.string().min(1)).optional(),
});

export const updatePrSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(50_000).optional(),
  requiresApprovals: requiresApprovalsSchema.optional(),
  reviewerIds: z.array(z.string().min(1)).optional(),
});

export const transitionPrSchema = z.object({
  to: z.nativeEnum(PrStatus),
});

export const submitReviewSchema = z.object({
  decision: z.nativeEnum(PrReviewDecision),
  comment: z.string().max(10_000).optional(),
});
