import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const attachmentsRoot = path.resolve(__dirname, "../../../data/attachments");

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const acme = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: {
      name: "Acme Corp",
      settings: {
        timezone: "America/New_York",
        featureFlags: { commentsEnabled: true, attachmentsEnabled: true },
      },
    },
    create: {
      name: "Acme Corp",
      slug: "acme",
      settings: {
        timezone: "America/New_York",
        featureFlags: { commentsEnabled: true, attachmentsEnabled: true },
      },
    },
  });

  const globex = await prisma.organization.upsert({
    where: { slug: "globex" },
    update: {
      name: "Globex Inc",
      settings: {
        timezone: "America/Los_Angeles",
        featureFlags: { commentsEnabled: true, attachmentsEnabled: false },
      },
    },
    create: {
      name: "Globex Inc",
      slug: "globex",
      settings: {
        timezone: "America/Los_Angeles",
        featureFlags: { commentsEnabled: true, attachmentsEnabled: false },
      },
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

  const eve = await prisma.user.upsert({
    where: { email: "eve@example.com" },
    update: { name: "Eve Guest", passwordHash },
    create: {
      email: "eve@example.com",
      name: "Eve Guest",
      passwordHash,
    },
  });

  await prisma.user.upsert({
    where: { email: "platform@example.com" },
    update: { name: "Platform Admin", passwordHash, isPlatformAdmin: true },
    create: {
      email: "platform@example.com",
      name: "Platform Admin",
      passwordHash,
      isPlatformAdmin: true,
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

  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: eve.id, orgId: acme.id } },
    update: { role: "CROSS_ORG_GUEST", acceptedAt: new Date() },
    create: {
      userId: eve.id,
      orgId: acme.id,
      role: "CROSS_ORG_GUEST",
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

  await prisma.pullRequest.deleteMany({
    where: { orgId: { in: [acme.id, globex.id] } },
  });

  const draftTitle = "Acme onboarding checklist";
  const draftDescription = "Draft PR for internal onboarding docs.";

  await prisma.pullRequest.create({
    data: {
      orgId: acme.id,
      authorId: alice.id,
      title: draftTitle,
      description: draftDescription,
      status: "DRAFT",
      requiresApprovals: 1,
      currentVersion: 1,
      versions: {
        create: {
          versionNumber: 1,
          title: draftTitle,
          description: draftDescription,
          createdById: alice.id,
        },
      },
    },
  });

  const reviewTitle = "Acme API rate limiting";
  const reviewDescription = "Proposal to add per-org rate limits on public endpoints.";

  await prisma.pullRequest.create({
    data: {
      orgId: acme.id,
      authorId: alice.id,
      title: reviewTitle,
      description: reviewDescription,
      status: "IN_REVIEW",
      requiresApprovals: 2,
      currentVersion: 1,
      versions: {
        create: {
          versionNumber: 1,
          title: reviewTitle,
          description: reviewDescription,
          createdById: alice.id,
        },
      },
      reviewers: {
        create: [{ userId: dave.id }, { userId: bob.id }],
      },
    },
  });

  const globexTitle = "Globex data retention policy";
  const globexDescription = "Update retention windows for customer audit exports.";

  await prisma.pullRequest.create({
    data: {
      orgId: globex.id,
      authorId: carol.id,
      title: globexTitle,
      description: globexDescription,
      status: "DRAFT",
      requiresApprovals: 1,
      currentVersion: 1,
      versions: {
        create: {
          versionNumber: 1,
          title: globexTitle,
          description: globexDescription,
          createdById: carol.id,
        },
      },
    },
  });

  const ticketSeeds = [
    {
      orgId: acme.id,
      title: "Billing discrepancy",
      status: "OPEN" as const,
      createdById: alice.id,
      assigneeId: bob.id,
    },
    {
      orgId: acme.id,
      title: "Password reset stuck",
      status: "IN_PROGRESS" as const,
      createdById: bob.id,
      assigneeId: bob.id,
    },
    {
      orgId: acme.id,
      title: "Feature request: SSO",
      status: "RESOLVED" as const,
      createdById: alice.id,
      assigneeId: null,
    },
    {
      orgId: globex.id,
      title: "VPN access",
      status: "OPEN" as const,
      createdById: carol.id,
      assigneeId: null,
    },
    {
      orgId: globex.id,
      title: "Invoice export failing",
      status: "CLOSED" as const,
      createdById: carol.id,
      assigneeId: carol.id,
    },
  ];

  for (const ticket of ticketSeeds) {
    await prisma.ticket.deleteMany({
      where: { orgId: ticket.orgId, title: ticket.title },
    });
  }

  await prisma.ticket.createMany({ data: ticketSeeds });

  const billingTicket = await prisma.ticket.findFirstOrThrow({
    where: { orgId: acme.id, title: "Billing discrepancy" },
  });

  await prisma.ticketComment.deleteMany({
    where: { ticketId: billingTicket.id },
  });

  await prisma.ticketComment.createMany({
    data: [
      {
        ticketId: billingTicket.id,
        orgId: acme.id,
        authorId: alice.id,
        body: "Customer reported double charge on invoice #4421.",
      },
      {
        ticketId: billingTicket.id,
        orgId: acme.id,
        authorId: bob.id,
        body: "Pulling billing logs — will update within the hour.",
      },
      {
        ticketId: billingTicket.id,
        orgId: acme.id,
        authorId: eve.id,
        body: "I can confirm the duplicate line item on the PDF they sent.",
      },
    ],
  });

  await prisma.ticketAttachment.deleteMany({
    where: { ticketId: billingTicket.id },
  });

  const attachmentContent = Buffer.from(
    "Invoice #4421 summary\nDouble charge detected on line item 3.\n",
    "utf8",
  );
  const attachment = await prisma.ticketAttachment.create({
    data: {
      ticketId: billingTicket.id,
      orgId: acme.id,
      uploadedById: bob.id,
      fileName: "invoice-summary.txt",
      mimeType: "text/plain",
      sizeBytes: attachmentContent.length,
      storageKey: "pending",
    },
  });

  const storageKey = `${acme.id}/${billingTicket.id}/${attachment.id}_invoice-summary.txt`;
  await prisma.ticketAttachment.update({
    where: { id: attachment.id },
    data: { storageKey },
  });

  await mkdir(path.join(attachmentsRoot, acme.id, billingTicket.id), {
    recursive: true,
  });
  await writeFile(path.join(attachmentsRoot, storageKey), attachmentContent);

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
  console.log(`  - eve@example.com    (CROSS_ORG_GUEST on Acme)`);
  console.log(`  - platform@example.com (Platform Super Admin, no org memberships)`);
  console.log("\nCross-org connection:");
  console.log(`  - Acme <-> Globex (ACCEPTED)`);
  console.log("\nSample pull requests:");
  console.log(
    `  - Acme: 1 DRAFT (alice), 1 IN_REVIEW with 2 reviewers (alice, requiresApprovals: 2)`,
  );
  console.log(`  - Globex: 1 DRAFT (carol)`);
  console.log("\nSample tickets:");
  for (const ticket of ticketSeeds) {
    const orgName = ticket.orgId === acme.id ? "Acme" : "Globex";
    console.log(`  - [${orgName}] ${ticket.title} (${ticket.status})`);
  }
  console.log("\nSample comments: 3 on Acme 'Billing discrepancy'");
  console.log(`Sample attachment: ${storageKey}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
