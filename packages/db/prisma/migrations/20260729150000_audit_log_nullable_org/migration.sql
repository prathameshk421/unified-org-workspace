-- Make audit_logs.orgId nullable and preserve history when an org is deleted.
ALTER TABLE "audit_logs" ALTER COLUMN "orgId" DROP NOT NULL;

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_orgId_fkey";

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Re-assert append-only grants for unified_app (idempotent; no password DDL).
GRANT SELECT, INSERT ON TABLE audit_logs TO unified_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM unified_app;
