import type { AuditLogDto } from "./service.js";

const CSV_COLUMNS = [
  "id",
  "createdAt",
  "orgId",
  "userId",
  "action",
  "entityType",
  "entityId",
  "metadata",
] as const;

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function serializeMetadata(metadata: Record<string, unknown>): string {
  return JSON.stringify(metadata ?? {});
}

export function buildAuditCsv(rows: AuditLogDto[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    [
      escapeCsvField(row.id),
      escapeCsvField(row.createdAt),
      escapeCsvField(row.orgId ?? ""),
      escapeCsvField(row.userId ?? ""),
      escapeCsvField(row.action),
      escapeCsvField(row.entityType),
      escapeCsvField(row.entityId),
      escapeCsvField(serializeMetadata(row.metadata)),
    ].join(","),
  );

  return [header, ...lines].join("\n");
}
