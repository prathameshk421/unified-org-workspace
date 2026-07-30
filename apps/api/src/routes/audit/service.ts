import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";

export const EXPORT_MAX_ROWS = 10_000;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;

export interface AuditLogDto {
  id: string;
  createdAt: string;
  orgId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}

export interface AuditListResult {
  items: AuditLogDto[];
  nextCursor: string | null;
}

type AuditFilterResult =
  | { ok: true; where: Prisma.AuditLogWhereInput; hasOptionalFilters: boolean }
  | { ok: false; statusCode: number; error: string; code: string };

function parseOptionalDate(value: unknown, field: string): { date?: Date; error?: string } {
  if (value === undefined || value === null || value === "") {
    return {};
  }
  if (typeof value !== "string") {
    return { error: `Invalid ${field} date` };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: `Invalid ${field} date` };
  }
  return { date };
}

function hasOptionalQueryFilters(query: Request["query"]): boolean {
  return Boolean(
    query.userId || query.action || query.from || query.to || query.entityType || query.entityId,
  );
}

export function buildAuditFilters(req: Request): AuditFilterResult {
  const clientOrgId = req.query.orgId;
  if (typeof clientOrgId === "string" && clientOrgId !== req.orgId) {
    return {
      ok: false,
      statusCode: 403,
      error: "Organization filter is not allowed",
      code: "org_filter_forbidden",
    };
  }

  const where: Prisma.AuditLogWhereInput = {
    orgId: req.orgId,
  };

  if (req.query.userId && typeof req.query.userId === "string") {
    where.userId = req.query.userId;
  }

  if (req.query.action && typeof req.query.action === "string") {
    where.action = req.query.action;
  }

  if (req.query.entityType && typeof req.query.entityType === "string") {
    where.entityType = req.query.entityType;
  }

  if (req.query.entityId && typeof req.query.entityId === "string") {
    where.entityId = req.query.entityId;
  }

  const fromResult = parseOptionalDate(req.query.from, "from");
  if (fromResult.error) {
    return {
      ok: false,
      statusCode: 400,
      error: fromResult.error,
      code: "invalid_from_date",
    };
  }

  const toResult = parseOptionalDate(req.query.to, "to");
  if (toResult.error) {
    return {
      ok: false,
      statusCode: 400,
      error: toResult.error,
      code: "invalid_to_date",
    };
  }

  if (fromResult.date || toResult.date) {
    where.createdAt = {};
    if (fromResult.date) {
      where.createdAt.gte = fromResult.date;
    }
    if (toResult.date) {
      where.createdAt.lte = toResult.date;
    }
  }

  return {
    ok: true,
    where,
    hasOptionalFilters: hasOptionalQueryFilters(req.query),
  };
}

function toAuditLogDto(row: {
  id: string;
  createdAt: Date;
  orgId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Prisma.JsonValue;
}): AuditLogDto {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    orgId: row.orgId,
    userId: row.userId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata,
  };
}

function parseListLimit(rawLimit: unknown): number | { error: string } {
  if (rawLimit === undefined || rawLimit === null || rawLimit === "") {
    return DEFAULT_LIST_LIMIT;
  }

  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { error: "Invalid limit" };
  }

  return Math.min(parsed, MAX_LIST_LIMIT);
}

export async function listAuditLogs(
  req: Request,
  where: Prisma.AuditLogWhereInput,
): Promise<AuditListResult | { error: string; code: string }> {
  const limitResult = parseListLimit(req.query.limit);
  if (typeof limitResult === "object") {
    return { error: limitResult.error, code: "invalid_limit" };
  }

  const cursor =
    req.query.cursor && typeof req.query.cursor === "string" ? req.query.cursor : undefined;

  if (cursor) {
    const cursorRow = await prisma.auditLog.findFirst({
      where: { id: cursor, orgId: req.orgId },
      select: { id: true },
    });
    if (!cursorRow) {
      return { error: "Invalid cursor", code: "invalid_cursor" };
    }
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limitResult + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  let nextCursor: string | null = null;
  let items = rows;
  if (items.length > limitResult) {
    const lastItem = items[limitResult - 1];
    nextCursor = lastItem?.id ?? null;
    items = items.slice(0, limitResult);
  }

  return {
    items: items.map(toAuditLogDto),
    nextCursor,
  };
}

export async function fetchAuditLogsForExport(
  where: Prisma.AuditLogWhereInput,
): Promise<AuditLogDto[]> {
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_MAX_ROWS,
  });

  return rows.map(toAuditLogDto);
}

export async function countAuditLogs(where: Prisma.AuditLogWhereInput): Promise<number> {
  return prisma.auditLog.count({ where });
}
