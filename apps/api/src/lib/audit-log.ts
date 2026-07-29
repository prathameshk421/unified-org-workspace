import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const METADATA_MAX_BYTES = 4 * 1024;
const STRING_MAX_LENGTH = 500;

const METADATA_DENYLIST = [
  "password",
  "passwordhash",
  "token",
  "refreshtoken",
  "accesstoken",
  "authorization",
  "cookie",
  "secret",
  "jwt",
];

function isDeniedKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (METADATA_DENYLIST.includes(lower)) {
    return true;
  }
  if (lower.startsWith("database_")) {
    return true;
  }
  return false;
}

function truncateString(value: string): string {
  if (value.length <= STRING_MAX_LENGTH) {
    return value;
  }
  return `${value.slice(0, STRING_MAX_LENGTH)}…`;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return truncateString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(sanitizeValue);
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (!isDeniedKey(key)) {
        result[key] = sanitizeValue(nested);
      }
    }
    return result;
  }
  return String(value);
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  if (!metadata) {
    return sanitized;
  }

  for (const [key, value] of Object.entries(metadata)) {
    if (!isDeniedKey(key)) {
      sanitized[key] = sanitizeValue(value);
    }
  }

  let serialized = JSON.stringify(sanitized);
  if (serialized.length <= METADATA_MAX_BYTES) {
    return sanitized;
  }

  const truncated: Record<string, unknown> = {
    _truncated: true,
    _originalBytes: serialized.length,
  };
  serialized = JSON.stringify(truncated);
  if (serialized.length <= METADATA_MAX_BYTES) {
    return truncated;
  }

  return { _truncated: true };
}

export type AuditRecordInput = {
  /** Session/active org from verified auth — never from client input. */
  orgId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append one audit row via the API Prisma client (`unified_app`).
 * Callers must supply orgId/userId from verified session only.
 */
export async function record(input: AuditRecordInput): Promise<void> {
  const metadata = sanitizeAuditMetadata(input.metadata);

  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

export const auditLog = { record };
