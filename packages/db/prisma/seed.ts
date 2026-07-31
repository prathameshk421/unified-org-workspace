import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { writeSeedAttachmentFile } from "./seed-attachment-write.js";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";

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

  // Real alt Gmail for Argus digest email testing (no secrets in seed).
  const daveEmail = "temporary.hamesha.ka.group@gmail.com";
  const legacyDave = await prisma.user.findUnique({
    where: { email: "dave@example.com" },
  });
  if (legacyDave) {
    await prisma.user.update({
      where: { id: legacyDave.id },
      data: { email: daveEmail },
    });
  }

  const dave = await prisma.user.upsert({
    where: { email: daveEmail },
    update: { name: "Dave Reviewer", passwordHash },
    create: {
      email: daveEmail,
      name: "Dave Reviewer",
      passwordHash,
    },
  });

  const eve = await prisma.user.upsert({
    where: { email: "eve@example.com" },
    update: { name: "Eve Agent", passwordHash },
    create: {
      email: "eve@example.com",
      name: "Eve Agent",
      passwordHash,
    },
  });

  const frank = await prisma.user.upsert({
    where: { email: "frank@example.com" },
    update: { name: "Frank Guest", passwordHash },
    create: {
      email: "frank@example.com",
      name: "Frank Guest",
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

  // Eve: Globex SUPPORT_AGENT only (receives Acme shares). Remove legacy Acme guest seat.
  await prisma.orgMembership.deleteMany({
    where: { userId: eve.id, orgId: acme.id },
  });
  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: eve.id, orgId: globex.id } },
    update: { role: "SUPPORT_AGENT", acceptedAt: new Date() },
    create: {
      userId: eve.id,
      orgId: globex.id,
      role: "SUPPORT_AGENT",
      acceptedAt: new Date(),
    },
  });

  // Frank: Acme CROSS_ORG_GUEST — assignee-only visibility (no same-org ShareGrant).
  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: frank.id, orgId: acme.id } },
    update: { role: "CROSS_ORG_GUEST", acceptedAt: new Date() },
    create: {
      userId: frank.id,
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

  await prisma.shareGrant.deleteMany({
    where: {
      OR: [{ ownerOrgId: { in: [acme.id, globex.id] } }, { granteeOrgId: { in: [acme.id, globex.id] } }],
    },
  });

  await prisma.prComment.deleteMany({
    where: { orgId: { in: [acme.id, globex.id] } },
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
        create: [{ userId: dave.id }, { userId: alice.id }],
      },
    },
  });

  const globexSharedTitle = "Globex data retention policy";
  const globexSharedDescription = "Update retention windows for customer audit exports.";

  const sharedGlobexPr = await prisma.pullRequest.create({
    data: {
      orgId: globex.id,
      authorId: carol.id,
      title: globexSharedTitle,
      description: globexSharedDescription,
      status: "DRAFT",
      requiresApprovals: 1,
      currentVersion: 1,
      versions: {
        create: {
          versionNumber: 1,
          title: globexSharedTitle,
          description: globexSharedDescription,
          createdById: carol.id,
        },
      },
    },
  });

  // Unshared Globex sibling for BOLA (Dave must not see this via share path).
  const globexSiblingTitle = "Globex billing API cleanup";
  const globexSiblingDescription = "Internal refactor of invoice export endpoints.";

  await prisma.pullRequest.create({
    data: {
      orgId: globex.id,
      authorId: carol.id,
      title: globexSiblingTitle,
      description: globexSiblingDescription,
      status: "DRAFT",
      requiresApprovals: 1,
      currentVersion: 1,
      versions: {
        create: {
          versionNumber: 1,
          title: globexSiblingTitle,
          description: globexSiblingDescription,
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
      orgId: acme.id,
      title: "Guest onboarding help",
      status: "OPEN" as const,
      createdById: alice.id,
      assigneeId: frank.id,
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

  await writeSeedAttachmentFile(storageKey, attachmentContent);

  // Cross-org shares (no same-org grants). Eve sees Billing via Globex session;
  // Dave sees shared Globex PR only when activeOrg=Acme.
  const billingShare = await prisma.shareGrant.create({
    data: {
      resourceType: "TICKET",
      resourceId: billingTicket.id,
      ownerOrgId: acme.id,
      granteeOrgId: globex.id,
      grantedToUserId: eve.id,
      grantedByUserId: alice.id,
      orgConnectionId: connection.id,
      status: "ACTIVE",
    },
  });

  const prShare = await prisma.shareGrant.create({
    data: {
      resourceType: "PULL_REQUEST",
      resourceId: sharedGlobexPr.id,
      ownerOrgId: globex.id,
      granteeOrgId: acme.id,
      grantedToUserId: dave.id,
      grantedByUserId: carol.id,
      orgConnectionId: connection.id,
      status: "ACTIVE",
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
        orgId: globex.id,
        userId: carol.id,
        action: "connection.accept",
        entityType: "OrgConnection",
        entityId: connection.id,
        metadata: { partnerOrgId: acme.id, status: "ACCEPTED" },
      },
      {
        orgId: acme.id,
        userId: alice.id,
        action: "share.create",
        entityType: "ShareGrant",
        entityId: billingShare.id,
        metadata: {
          resourceType: "TICKET",
          resourceId: billingTicket.id,
          granteeOrgId: globex.id,
          grantedToUserId: eve.id,
        },
      },
      {
        orgId: globex.id,
        userId: carol.id,
        action: "share.create",
        entityType: "ShareGrant",
        entityId: prShare.id,
        metadata: {
          resourceType: "PULL_REQUEST",
          resourceId: sharedGlobexPr.id,
          granteeOrgId: acme.id,
          grantedToUserId: dave.id,
        },
      },
    ],
    skipDuplicates: true,
  });

  console.log("\nSeed complete.\n");
  console.log("Organizations:");
  console.log(`  - ${acme.name} (${acme.slug})`);
  console.log(`  - ${globex.name} (${globex.slug})`);
  console.log("\nUsers (password: password123):");
  console.log(`  - alice@acme.com        (ORG_ADMIN on Acme)`);
  console.log(`  - bob@acme.com          (SUPPORT_AGENT on Acme)`);
  console.log(`  - carol@globex.com      (ORG_ADMIN on Globex)`);
  console.log(`  - temporary.hamesha.ka.group@gmail.com  (REVIEWER on Acme + Globex; Argus inbox)`);
  console.log(`  - eve@example.com       (SUPPORT_AGENT on Globex; receives Acme ticket share)`);
  console.log(`  - frank@example.com     (CROSS_ORG_GUEST on Acme; assignee-only)`);
  console.log(`  - platform@example.com  (Platform Super Admin, no org memberships)`);
  console.log("\nCross-org connection:");
  console.log(`  - Acme <-> Globex (ACCEPTED)`);
  console.log("\nCross-org shares:");
  console.log(`  - Alice → Eve: Acme ticket "Billing discrepancy" (granteeOrg=Globex)`);
  console.log(
    `  - Carol → Dave: Globex PR "Globex data retention policy" (granteeOrg=Acme; Dave must use activeOrg=Acme)`,
  );
  console.log("\nSample pull requests:");
  console.log(
    `  - Acme: 1 DRAFT (alice), 1 IN_REVIEW with 2 reviewers (dave + alice, requiresApprovals: 2)`,
  );
  console.log(`  - Globex: 1 shared DRAFT (carol), 1 unshared sibling DRAFT (carol)`);
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
