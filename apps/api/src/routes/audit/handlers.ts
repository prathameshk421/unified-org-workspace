import type { Request, Response } from "express";
import { buildAuditCsv } from "./csv.js";
import {
  buildAuditFilters,
  countAuditLogs,
  EXPORT_MAX_ROWS,
  fetchAuditLogsForExport,
  listAuditLogs,
} from "./service.js";

export async function listAuditHandler(req: Request, res: Response): Promise<void> {
  const filters = buildAuditFilters(req);
  if (!filters.ok) {
    res.status(filters.statusCode).json({
      error: filters.error,
      code: filters.code,
    });
    return;
  }

  const result = await listAuditLogs(req, filters.where);
  if ("error" in result) {
    res.status(400).json({ error: result.error, code: result.code });
    return;
  }

  res.json(result);
}

export async function exportAuditHandler(req: Request, res: Response): Promise<void> {
  const filters = buildAuditFilters(req);
  if (!filters.ok) {
    res.status(filters.statusCode).json({
      error: filters.error,
      code: filters.code,
    });
    return;
  }

  const total = await countAuditLogs(filters.where);
  if (total > EXPORT_MAX_ROWS) {
    res.status(400).json({
      error: filters.hasOptionalFilters
        ? `Export exceeds ${EXPORT_MAX_ROWS} rows; narrow your filters`
        : `Export exceeds ${EXPORT_MAX_ROWS} rows; apply filters before exporting`,
      code: filters.hasOptionalFilters ? "export_too_large" : "export_requires_filters",
    });
    return;
  }

  const rows = await fetchAuditLogsForExport(filters.where);
  const csv = buildAuditCsv(rows);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="audit-export.csv"');
  res.send(csv);
}
