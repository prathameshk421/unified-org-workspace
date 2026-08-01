import { expect } from "vitest";
import type { Response } from "supertest";
import { ownerDb } from "./db.js";

type Agent = {
  get: (path: string) => {
    expect: (status: number) => Promise<Response>;
  };
};

export async function dropOrgMembership(userId: string, orgId: string): Promise<void> {
  await ownerDb.orgMembership.delete({
    where: { userId_orgId: { userId, orgId } },
  });
}

/**
 * Owner-alive sequence: snapshot → owner GET 200 → attack exact status →
 * ownerDb unchanged (business fields) → owner GET 200.
 * Never compares updatedAt.
 */
export async function assertOwnerAliveAttackerDenyOwnerUnchanged<T>(input: {
  ownerAgent: Agent;
  ownerGetPath: string;
  attack: () => Promise<Response>;
  snapshot: () => Promise<T>;
  expectEqual: (before: T, after: T) => void;
  expectAttackStatus: number;
  /** Optional victim strings that must not appear in the attack response body. */
  forbiddenBodySubstrings?: string[];
}): Promise<Response> {
  const before = await input.snapshot();

  await input.ownerAgent.get(input.ownerGetPath).expect(200);

  const attackRes = await input.attack();
  expect(attackRes.status).toBe(input.expectAttackStatus);

  const bodyJson = JSON.stringify(attackRes.body ?? {});
  for (const needle of input.forbiddenBodySubstrings ?? []) {
    expect(bodyJson).not.toContain(needle);
  }

  const afterAttack = await input.snapshot();
  input.expectEqual(before, afterAttack);

  const ownerAgain = await input.ownerAgent.get(input.ownerGetPath).expect(200);
  expect(ownerAgain.status).toBe(200);

  const afterOwnerGet = await input.snapshot();
  input.expectEqual(before, afterOwnerGet);

  return attackRes;
}

/** Re-read ownerDb and assert business fields equal (caller supplies equality). */
export async function assertOwnerDbUnchanged<T>(input: {
  before: T;
  snapshot: () => Promise<T>;
  expectEqual: (before: T, after: T) => void;
}): Promise<void> {
  const after = await input.snapshot();
  input.expectEqual(input.before, after);
}

/** Assert no successful mutation audit row exists for entity after a denied attack. */
export async function assertNoSuccessAuditForEntity(input: {
  entityType: string;
  entityId: string;
  /** Actions that would indicate a successful mutation — must be absent. */
  forbiddenActions: string[];
  /** Only consider audits created at/after this time. */
  since: Date;
}): Promise<void> {
  const rows = await ownerDb.auditLog.findMany({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
      createdAt: { gte: input.since },
      action: { in: input.forbiddenActions },
    },
    select: { action: true, id: true },
  });
  expect(rows).toEqual([]);
}

export function ticketBusinessFields(row: {
  title: string;
  status: string;
  description: string;
  assigneeId: string | null;
}) {
  return {
    title: row.title,
    status: row.status,
    description: row.description,
    assigneeId: row.assigneeId,
  };
}

export function prBusinessFields(row: {
  title: string;
  status: string;
  description: string;
  currentVersion: number;
}) {
  return {
    title: row.title,
    status: row.status,
    description: row.description,
    currentVersion: row.currentVersion,
  };
}

export async function snapshotTicket(id: string) {
  const row = await ownerDb.ticket.findUniqueOrThrow({ where: { id } });
  return ticketBusinessFields(row);
}

export async function snapshotPr(id: string) {
  const row = await ownerDb.pullRequest.findUniqueOrThrow({ where: { id } });
  return prBusinessFields(row);
}

export async function snapshotComment(id: string) {
  const row = await ownerDb.ticketComment.findUniqueOrThrow({ where: { id } });
  return { body: row.body, ticketId: row.ticketId, orgId: row.orgId };
}

export async function snapshotAttachment(id: string) {
  const row = await ownerDb.ticketAttachment.findUniqueOrThrow({ where: { id } });
  return {
    fileName: row.fileName,
    storageKey: row.storageKey,
    ticketId: row.ticketId,
    orgId: row.orgId,
  };
}

export async function snapshotShareGrant(id: string) {
  const row = await ownerDb.shareGrant.findUniqueOrThrow({ where: { id } });
  return { status: row.status, resourceId: row.resourceId };
}
