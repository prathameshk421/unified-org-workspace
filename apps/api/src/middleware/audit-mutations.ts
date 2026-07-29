import type { NextFunction, Request, Response } from "express";
import { AuditAction } from "@unified/types";
import { type AuditRecordInput, record } from "../lib/audit-log.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const SKIP_PATHS = new Set(["/health", "/auth/refresh"]);

function ensureAuditLocals(res: Response): void {
  if (!res.locals.auditEvents) {
    res.locals.auditEvents = [];
  }
}

export function queueAudit(
  req: Request,
  res: Response,
  partial: Omit<AuditRecordInput, "orgId" | "userId"> &
    Partial<Pick<AuditRecordInput, "orgId" | "userId">>,
): void {
  ensureAuditLocals(res);

  const orgId =
    partial.orgId ?? req.orgId ?? req.auth?.activeOrgId ?? null;
  const userId = partial.userId ?? req.auth?.userId ?? null;

  res.locals.auditEvents!.push({
    orgId,
    userId,
    action: partial.action,
    entityType: partial.entityType,
    entityId: partial.entityId,
    metadata: partial.metadata,
  });
}

export function markAuditWritten(res: Response): void {
  res.locals.auditWritten = true;
}

async function flushAuditEvents(req: Request, res: Response): Promise<void> {
  if (res.statusCode >= 400 || res.locals.auditWritten) {
    return;
  }

  const events = res.locals.auditEvents ?? [];

  if (events.length > 0) {
    await Promise.all(events.map((event) => record(event)));
    return;
  }

  const path = req.path;
  if (SKIP_PATHS.has(path)) {
    return;
  }

  if (process.env.NODE_ENV === "development") {
    console.error(
      `[audit] missing audit event for successful mutation ${req.method} ${path}`,
    );
  }

  const orgId = req.orgId ?? req.auth?.activeOrgId ?? null;
  const userId = req.auth?.userId ?? null;

  await record({
    orgId,
    userId,
    action: AuditAction.HTTP_MUTATION,
    entityType: "http",
    entityId: `${req.method}:${path}`,
    metadata: { statusCode: res.statusCode },
  });
}

export function auditMutations(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!MUTATION_METHODS.has(req.method)) {
    next();
    return;
  }

  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  ensureAuditLocals(res);

  res.on("finish", () => {
    void flushAuditEvents(req, res).catch((error: unknown) => {
      console.error("[audit] failed to flush audit events after response:", error);
    });
  });

  next();
}
