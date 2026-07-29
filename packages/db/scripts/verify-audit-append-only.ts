import { PrismaClient } from "@prisma/client";

const DATABASE_APP_URL = process.env.DATABASE_APP_URL;

if (!DATABASE_APP_URL) {
  console.error("DATABASE_APP_URL is required for append-only verification");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_APP_URL,
    },
  },
});

function isPermissionDenied(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("permission denied") ||
    message.includes("42501") ||
    message.includes("p2010")
  );
}

async function main(): Promise<void> {
  const currentUser = await prisma.$queryRaw<Array<{ current_user: string }>>`
    SELECT current_user
  `;
  const role = currentUser[0]?.current_user;

  if (role !== "unified_app") {
    throw new Error(
      `Expected current_user unified_app but got ${role ?? "unknown"} — use DATABASE_APP_URL`,
    );
  }

  const entityId = `verify-${Date.now()}`;
  const row = await prisma.auditLog.create({
    data: {
      orgId: null,
      userId: null,
      action: "test.append_only",
      entityType: "test",
      entityId,
      metadata: { probe: true },
    },
  });

  try {
    await prisma.$executeRaw`
      UPDATE audit_logs SET action = 'hacked' WHERE id = ${row.id}
    `;
    throw new Error("UPDATE on audit_logs succeeded but should be denied");
  } catch (error) {
    if (!isPermissionDenied(error)) {
      throw error;
    }
  }

  try {
    await prisma.$executeRaw`
      DELETE FROM audit_logs WHERE id = ${row.id}
    `;
    throw new Error("DELETE on audit_logs succeeded but should be denied");
  } catch (error) {
    if (!isPermissionDenied(error)) {
      throw error;
    }
  }

  console.log(
    "audit_logs append-only verified: INSERT ok, UPDATE/DELETE denied for unified_app",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
