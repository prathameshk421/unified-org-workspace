-- Create application role with restricted audit_log permissions
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'unified_app') THEN
    CREATE ROLE unified_app WITH LOGIN PASSWORD 'unified_app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE unified_org TO unified_app;
GRANT USAGE ON SCHEMA public TO unified_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE organizations TO unified_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO unified_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE org_memberships TO unified_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sessions TO unified_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE refresh_tokens TO unified_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE org_connections TO unified_app;

-- Audit logs: append-only for application role
GRANT SELECT, INSERT ON TABLE audit_logs TO unified_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM unified_app;

-- Enum types used by application tables
GRANT USAGE ON TYPE "OrgRole" TO unified_app;
GRANT USAGE ON TYPE "OrgConnectionStatus" TO unified_app;

-- Sequences (for any future serial/bigserial columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO unified_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO unified_app;

-- Default privileges for future tables created by postgres role
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO unified_app;
