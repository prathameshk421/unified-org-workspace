-- CreateEnum
CREATE TYPE "ShareResourceType" AS ENUM ('TICKET', 'PULL_REQUEST');

-- CreateEnum
CREATE TYPE "ShareGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "share_grants" (
    "id" TEXT NOT NULL,
    "resourceType" "ShareResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "ownerOrgId" TEXT NOT NULL,
    "granteeOrgId" TEXT NOT NULL,
    "grantedToUserId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "orgConnectionId" TEXT NOT NULL,
    "status" "ShareGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "share_grants_cross_org_check" CHECK ("ownerOrgId" <> "granteeOrgId" AND "orgConnectionId" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "pr_comments" (
    "id" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "authorOrgId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pr_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "share_grants_grantedToUserId_status_idx" ON "share_grants"("grantedToUserId", "status");

-- CreateIndex
CREATE INDEX "share_grants_granteeOrgId_status_idx" ON "share_grants"("granteeOrgId", "status");

-- CreateIndex
CREATE INDEX "share_grants_ownerOrgId_resourceType_status_idx" ON "share_grants"("ownerOrgId", "resourceType", "status");

-- CreateIndex
CREATE INDEX "share_grants_resourceType_resourceId_status_idx" ON "share_grants"("resourceType", "resourceId", "status");

-- CreateIndex
CREATE INDEX "share_grants_orgConnectionId_status_idx" ON "share_grants"("orgConnectionId", "status");

-- Partial unique: only one ACTIVE grant per (resource, grantee user). REVOKED rows do not block re-share.
CREATE UNIQUE INDEX "share_grants_active_unique" ON "share_grants"("resourceType", "resourceId", "grantedToUserId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "pr_comments_pullRequestId_idx" ON "pr_comments"("pullRequestId");

-- CreateIndex
CREATE INDEX "pr_comments_orgId_pullRequestId_idx" ON "pr_comments"("orgId", "pullRequestId");

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_granteeOrgId_fkey" FOREIGN KEY ("granteeOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_grantedToUserId_fkey" FOREIGN KEY ("grantedToUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_orgConnectionId_fkey" FOREIGN KEY ("orgConnectionId") REFERENCES "org_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_comments" ADD CONSTRAINT "pr_comments_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_comments" ADD CONSTRAINT "pr_comments_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_comments" ADD CONSTRAINT "pr_comments_authorOrgId_fkey" FOREIGN KEY ("authorOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_comments" ADD CONSTRAINT "pr_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application role grants (API uses unified_app via DATABASE_APP_URL)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE share_grants TO unified_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pr_comments TO unified_app;
GRANT USAGE ON TYPE "ShareResourceType" TO unified_app;
GRANT USAGE ON TYPE "ShareGrantStatus" TO unified_app;
