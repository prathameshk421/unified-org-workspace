import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import type { OrgRole } from "@unified/types";
import { ownerDb } from "./db.js";

export const RUN_TAG = `vtest-${randomUUID()}`;

let passwordHashPromise: Promise<string> | undefined;

async function getPasswordHash(): Promise<string> {
  passwordHashPromise ??= hash("password123", 12);
  return passwordHashPromise;
}

export interface FixtureOrg {
  id: string;
  slug: string;
  name: string;
}

export interface FixtureUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  orgs: Array<{ orgId: string; role: OrgRole }>;
}

const trackedUserIds = new Set<string>();
const trackedOrgIds = new Set<string>();

/** Track users created via POST /auth/register (not createUser). */
export function trackApiRegisteredUser(user: { id: string }): void {
  trackedUserIds.add(user.id);
}

export function createRunTaggedEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@${RUN_TAG}.test`;
}

export async function createOrg(name?: string): Promise<FixtureOrg> {
  const slug = `${RUN_TAG}-${randomUUID().slice(0, 8)}`;
  const org = await ownerDb.organization.create({
    data: {
      name: name ?? `Org ${slug}`,
      slug,
      settings: {},
    },
  });
  trackedOrgIds.add(org.id);
  return { id: org.id, slug: org.slug, name: org.name };
}

export async function createUser(input: {
  email?: string;
  name?: string;
  isPlatformAdmin?: boolean;
  orgs?: Array<{ org: FixtureOrg; role: OrgRole; accepted?: boolean }>;
} = {}): Promise<FixtureUser> {
  const passwordHash = await getPasswordHash();
  const email = input.email ?? createRunTaggedEmail();

  const user = await ownerDb.user.create({
    data: {
      email,
      name: input.name ?? "Test User",
      passwordHash,
      isPlatformAdmin: input.isPlatformAdmin ?? false,
    },
  });

  trackedUserIds.add(user.id);

  const orgs: Array<{ orgId: string; role: OrgRole }> = [];

  for (const membership of input.orgs ?? []) {
    await ownerDb.orgMembership.create({
      data: {
        userId: user.id,
        orgId: membership.org.id,
        role: membership.role,
        acceptedAt: membership.accepted === false ? null : new Date(),
      },
    });
    orgs.push({ orgId: membership.org.id, role: membership.role });
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: user.isPlatformAdmin,
    orgs,
  };
}

export async function createPendingMembership(input: {
  userId: string;
  orgId: string;
  role: OrgRole;
}): Promise<void> {
  await ownerDb.orgMembership.create({
    data: {
      userId: input.userId,
      orgId: input.orgId,
      role: input.role,
      acceptedAt: null,
    },
  });
}

export async function cleanupRunFixtures(): Promise<void> {
  const userIds = [...trackedUserIds];
  const orgIds = [...trackedOrgIds];

  if (userIds.length > 0) {
    await ownerDb.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await ownerDb.user.deleteMany({ where: { id: { in: userIds } } });
  }

  if (orgIds.length > 0) {
    await ownerDb.organization.deleteMany({ where: { id: { in: orgIds } } });
  }

  trackedUserIds.clear();
  trackedOrgIds.clear();
}
