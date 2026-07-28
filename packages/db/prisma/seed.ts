import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const acme = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: { name: "Acme Corp" },
    create: {
      name: "Acme Corp",
      slug: "acme",
      settings: { timezone: "America/New_York" },
    },
  });

  const globex = await prisma.organization.upsert({
    where: { slug: "globex" },
    update: { name: "Globex Inc" },
    create: {
      name: "Globex Inc",
      slug: "globex",
      settings: { timezone: "America/Los_Angeles" },
    },
  });

  const alice = await prisma.user.upsert({
    where: { email: "alice@acme.com" },
    update: { name: "Alice Admin", passwordHash },
    create: {
      email: "alice@acme.com",
      name: "Alice Admin",
      passwordHash,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@acme.com" },
    update: { name: "Bob Agent", passwordHash },
    create: {
      email: "bob@acme.com",
      name: "Bob Agent",
      passwordHash,
    },
  });

  const carol = await prisma.user.upsert({
    where: { email: "carol@globex.com" },
    update: { name: "Carol Admin", passwordHash },
    create: {
      email: "carol@globex.com",
      name: "Carol Admin",
      passwordHash,
    },
  });

  const dave = await prisma.user.upsert({
    where: { email: "dave@example.com" },
    update: { name: "Dave Reviewer", passwordHash },
    create: {
      email: "dave@example.com",
      name: "Dave Reviewer",
      passwordHash,
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: alice.id, orgId: acme.id } },
    update: { role: "ORG_ADMIN", acceptedAt: new Date() },
    create: {
      userId: alice.id,
      orgId: acme.id,
      role: "ORG_ADMIN",
      acceptedAt: new Date(),
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: bob.id, orgId: acme.id } },
    update: { role: "SUPPORT_AGENT", acceptedAt: new Date() },
    create: {
      userId: bob.id,
      orgId: acme.id,
      role: "SUPPORT_AGENT",
      acceptedAt: new Date(),
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: carol.id, orgId: globex.id } },
    update: { role: "ORG_ADMIN", acceptedAt: new Date() },
    create: {
      userId: carol.id,
      orgId: globex.id,
      role: "ORG_ADMIN",
      acceptedAt: new Date(),
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: dave.id, orgId: acme.id } },
    update: { role: "REVIEWER", acceptedAt: new Date() },
    create: {
      userId: dave.id,
      orgId: acme.id,
      role: "REVIEWER",
      acceptedAt: new Date(),
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: dave.id, orgId: globex.id } },
    update: { role: "REVIEWER", acceptedAt: new Date() },
    create: {
      userId: dave.id,
      orgId: globex.id,
      role: "REVIEWER",
      acceptedAt: new Date(),
    },
  });

  const [orgAId, orgBId] = acme.id < globex.id ? [acme.id, globex.id] : [globex.id, acme.id];

  const connection = await prisma.orgConnection.upsert({
    where: { orgAId_orgBId: { orgAId, orgBId } },
    update: {
      status: "ACCEPTED",
      requestedById: alice.id,
      respondedById: carol.id,
    },
    create: {
      orgAId,
      orgBId,
      status: "ACCEPTED",
      requestedById: alice.id,
      respondedById: carol.id,
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        orgId: acme.id,
        userId: alice.id,
        action: "ORG_CREATED",
        entityType: "Organization",
        entityId: acme.id,
        metadata: { slug: acme.slug },
      },
      {
        orgId: globex.id,
        userId: carol.id,
        action: "ORG_CREATED",
        entityType: "Organization",
        entityId: globex.id,
        metadata: { slug: globex.slug },
      },
      {
        orgId: acme.id,
        userId: alice.id,
        action: "CONNECTION_ACCEPTED",
        entityType: "OrgConnection",
        entityId: connection.id,
        metadata: { partnerOrgId: globex.id, status: "ACCEPTED" },
      },
    ],
    skipDuplicates: true,
  });

  console.log("\nSeed complete.\n");
  console.log("Organizations:");
  console.log(`  - ${acme.name} (${acme.slug})`);
  console.log(`  - ${globex.name} (${globex.slug})`);
  console.log("\nUsers (password: password123):");
  console.log(`  - alice@acme.com   (ORG_ADMIN on Acme)`);
  console.log(`  - bob@acme.com     (SUPPORT_AGENT on Acme)`);
  console.log(`  - carol@globex.com (ORG_ADMIN on Globex)`);
  console.log(`  - dave@example.com (REVIEWER on Acme + Globex)`);
  console.log("\nCross-org connection:");
  console.log(`  - Acme <-> Globex (ACCEPTED)`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
