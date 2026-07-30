-- CreateEnum
CREATE TYPE "PrStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "PrReviewDecision" AS ENUM ('APPROVE', 'REQUEST_CHANGES');

-- CreateTable
CREATE TABLE "pull_requests" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "PrStatus" NOT NULL DEFAULT 'DRAFT',
    "requiresApprovals" INTEGER NOT NULL DEFAULT 1,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_versions" (
    "id" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pr_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_reviewers" (
    "id" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "pr_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_reviews" (
    "id" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "PrReviewDecision" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pr_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pull_requests_orgId_idx" ON "pull_requests"("orgId");

-- CreateIndex
CREATE INDEX "pull_requests_orgId_status_idx" ON "pull_requests"("orgId", "status");

-- CreateIndex
CREATE INDEX "pull_requests_authorId_idx" ON "pull_requests"("authorId");

-- CreateIndex
CREATE INDEX "pr_versions_pullRequestId_idx" ON "pr_versions"("pullRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "pr_versions_pullRequestId_versionNumber_key" ON "pr_versions"("pullRequestId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "pr_reviewers_pullRequestId_userId_key" ON "pr_reviewers"("pullRequestId", "userId");

-- CreateIndex
CREATE INDEX "pr_reviews_pullRequestId_versionId_idx" ON "pr_reviews"("pullRequestId", "versionId");

-- CreateIndex
CREATE INDEX "pr_reviews_reviewerId_idx" ON "pr_reviews"("reviewerId");

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_versions" ADD CONSTRAINT "pr_versions_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_versions" ADD CONSTRAINT "pr_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviewers" ADD CONSTRAINT "pr_reviewers_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviewers" ADD CONSTRAINT "pr_reviewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviews" ADD CONSTRAINT "pr_reviews_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviews" ADD CONSTRAINT "pr_reviews_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "pr_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_reviews" ADD CONSTRAINT "pr_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application role grants (API uses unified_app via DATABASE_APP_URL)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pull_requests TO unified_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pr_versions TO unified_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pr_reviewers TO unified_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pr_reviews TO unified_app;
GRANT USAGE ON TYPE "PrStatus" TO unified_app;
GRANT USAGE ON TYPE "PrReviewDecision" TO unified_app;
