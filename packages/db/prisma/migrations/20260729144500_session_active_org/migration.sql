-- Persist active org on the session so dashboards sharing a session (or the same user)
-- see org switches after reload, not only via the JWT cookie claim.
ALTER TABLE "sessions" ADD COLUMN "activeOrgId" TEXT;

CREATE INDEX "sessions_activeOrgId_idx" ON "sessions"("activeOrgId");
