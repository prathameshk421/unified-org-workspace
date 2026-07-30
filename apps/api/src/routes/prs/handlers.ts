import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  AuditAction,
  type AuditAction as AuditActionType,
  PrReviewDecision,
  PrStatus,
} from "@unified/types";
import { queueAudit } from "../../middleware/audit-mutations.js";
import { badRequest, HttpError } from "./errors.js";
import {
  createPrSchema,
  submitReviewSchema,
  transitionPrSchema,
  updatePrSchema,
} from "./schemas.js";
import { toPullRequestDetail } from "./mappers.js";
import * as prService from "./service.js";

function requirePrId(req: Request): string {
  const id = req.params.id;
  if (!id) {
    throw badRequest("Missing pull request id");
  }
  return id;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.flatten().fieldErrors,
    });
    return;
  }

  if (error instanceof HttpError) {
    const body: Record<string, unknown> = { error: error.message };
    if (error.code) {
      body.code = error.code;
    }
    res.status(error.statusCode).json(body);
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}

export async function createPrHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = createPrSchema.parse(req.body);
    const orgId = req.orgId!;
    const authorId = req.auth!.userId;

    const pr = await prService.createPullRequest(orgId, authorId, body);

    queueAudit(req, res, {
      action: AuditAction.PR_CREATE,
      entityType: "pull_request",
      entityId: pr.id,
      metadata: { status: pr.status, version: pr.currentVersion },
    });

    res.status(201).json(pr);
  } catch (error) {
    handleError(res, error);
  }
}

export async function listPrsHandler(req: Request, res: Response): Promise<void> {
  try {
    const prs = await prService.listOrgPullRequests(req.orgId!);
    res.json(prs);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getPrHandler(req: Request, res: Response): Promise<void> {
  try {
    const pr = await prService.getOrgPrOrThrow(requirePrId(req), req.orgId!);
    res.json(toPullRequestDetail(pr));
  } catch (error) {
    handleError(res, error);
  }
}

export async function updatePrHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = updatePrSchema.parse(req.body);
    const pr = await prService.updatePullRequest(
      requirePrId(req),
      req.orgId!,
      req.auth!.userId,
      body,
    );

    queueAudit(req, res, {
      action: AuditAction.PR_UPDATE,
      entityType: "pull_request",
      entityId: pr.id,
      metadata: { status: pr.status, version: pr.currentVersion },
    });

    res.json(pr);
  } catch (error) {
    handleError(res, error);
  }
}

export async function transitionPrHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = transitionPrSchema.parse(req.body);
    const pr = await prService.transitionPullRequest(requirePrId(req), req.orgId!, body.to);

    let action: AuditActionType = AuditAction.PR_STATUS_CHANGE;
    if (body.to === PrStatus.REJECTED) {
      action = AuditAction.PR_REJECT;
    } else if (body.to === PrStatus.MERGED) {
      action = AuditAction.PR_MERGE;
    } else if (body.to === PrStatus.IN_REVIEW) {
      action = AuditAction.PR_SUBMIT_REVIEW;
    }

    queueAudit(req, res, {
      action,
      entityType: "pull_request",
      entityId: pr.id,
      metadata: { status: pr.status, version: pr.currentVersion, to: body.to },
    });

    res.json(pr);
  } catch (error) {
    handleError(res, error);
  }
}

export async function submitReviewHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = submitReviewSchema.parse(req.body);
    const pr = await prService.submitReview(
      requirePrId(req),
      req.orgId!,
      req.auth!.userId,
      req.auth!.role,
      body,
    );

    const action =
      body.decision === PrReviewDecision.APPROVE
        ? AuditAction.PR_APPROVE
        : AuditAction.PR_REQUEST_CHANGES;

    queueAudit(req, res, {
      action,
      entityType: "pull_request",
      entityId: pr.id,
      metadata: {
        status: pr.status,
        version: pr.currentVersion,
        decision: body.decision,
      },
    });

    res.json(pr);
  } catch (error) {
    handleError(res, error);
  }
}

export async function listVersionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const versions = await prService.listVersions(requirePrId(req), req.orgId!);
    res.json(versions);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getVersionDiffHandler(req: Request, res: Response): Promise<void> {
  try {
    const versionNumber = Number.parseInt(req.params.versionNumber ?? "", 10);
    if (!Number.isFinite(versionNumber) || versionNumber < 1) {
      res.status(400).json({ error: "Invalid version number" });
      return;
    }

    const diff = await prService.getVersionDiff(requirePrId(req), req.orgId!, versionNumber);
    res.json(diff);
  } catch (error) {
    handleError(res, error);
  }
}

export async function listOrgMembersHandler(req: Request, res: Response): Promise<void> {
  try {
    const members = await prService.listOrgMembers(req.orgId!);
    res.json(members);
  } catch (error) {
    handleError(res, error);
  }
}
