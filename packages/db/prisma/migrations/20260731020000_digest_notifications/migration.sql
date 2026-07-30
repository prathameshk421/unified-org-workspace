-- CreateEnum
CREATE TYPE "DigestRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DIGEST');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP');

-- CreateTable
CREATE TABLE "digest_runs" (
    "id" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "DigestRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "processedUserCount" INTEGER NOT NULL DEFAULT 0,
    "notifiedUserCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "stats" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "digest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'DIGEST',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "facts" JSONB NOT NULL DEFAULT '{}',
    "resourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "redactedAt" TIMESTAMP(3),
    "digestRunId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "digest_runs_scheduledFor_key" ON "digest_runs"("scheduledFor");

-- CreateIndex
CREATE INDEX "digest_runs_status_startedAt_idx" ON "digest_runs"("status", "startedAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_redactedAt_idx" ON "notifications"("userId", "redactedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_digestRunId_type_channel_key" ON "notifications"("userId", "digestRunId", "type", "channel");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_digestRunId_fkey" FOREIGN KEY ("digestRunId") REFERENCES "digest_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Application role grants (API uses unified_app via DATABASE_APP_URL)
GRANT SELECT, INSERT, UPDATE ON TABLE digest_runs TO unified_app;
GRANT SELECT, INSERT, UPDATE ON TABLE notifications TO unified_app;
GRANT USAGE ON TYPE "DigestRunStatus" TO unified_app;
GRANT USAGE ON TYPE "NotificationType" TO unified_app;
GRANT USAGE ON TYPE "NotificationChannel" TO unified_app;
