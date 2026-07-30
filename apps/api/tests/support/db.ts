import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(import.meta.dirname, "../../../../.env");
if (existsSync(envPath)) {
  config({ path: envPath, override: false });
}

process.env.JWT_SECRET ??=
  "test-only-secret-min-32-characters-long!!";
process.env.DATABASE_APP_URL ??=
  "postgresql://unified_app:unified_app@localhost:5432/unified_org";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/unified_org";
process.env.COOKIE_SECURE ??= "false";
process.env.AUTH_RATE_LIMIT_MAX ??= "1000";
process.env.ATTACHMENTS_DIR ??= `${process.env.TMPDIR ?? "/tmp"}/unified-attachments-test-${process.pid}`;

function assertLocalDatabase(url: string, label: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`Invalid ${label}: could not parse hostname`);
  }

  const local = host === "localhost" || host === "127.0.0.1";
  if (!local && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
    throw new Error(
      `${label} host "${host}" is not local — set ALLOW_REMOTE_TEST_DB=1 to override`,
    );
  }
}

const databaseUrl = process.env.DATABASE_URL;
const databaseAppUrl = process.env.DATABASE_APP_URL;

if (!databaseUrl || !databaseAppUrl) {
  throw new Error("DATABASE_URL and DATABASE_APP_URL are required for integration tests");
}

assertLocalDatabase(databaseUrl, "DATABASE_URL");
assertLocalDatabase(databaseAppUrl, "DATABASE_APP_URL");

export const ownerDb = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

export const appDb = new PrismaClient({
  datasources: { db: { url: databaseAppUrl } },
});

export async function assertAppRole(): Promise<void> {
  const rows = await appDb.$queryRaw<Array<{ current_user: string }>>`
    SELECT current_user
  `;
  const role = rows[0]?.current_user;
  if (role !== "unified_app") {
    throw new Error(
      `Expected current_user unified_app but got ${role ?? "unknown"} — run prisma migrate deploy`,
    );
  }
}

export async function cleanupStaleFixtures(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const staleUsers = await ownerDb.user.findMany({
    where: {
      email: { contains: "@vtest-" },
      createdAt: { lt: oneHourAgo },
    },
    select: { id: true },
  });

  if (staleUsers.length === 0) {
    return;
  }

  const userIds = staleUsers.map((user) => user.id);
  await ownerDb.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await ownerDb.user.deleteMany({ where: { id: { in: userIds } } });
}

export async function disconnectDatabases(): Promise<void> {
  await Promise.all([ownerDb.$disconnect(), appDb.$disconnect()]);
}
