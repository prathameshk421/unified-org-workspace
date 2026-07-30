import { OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import {
  cleanupRunFixtures,
  createOrg,
  createTicket,
  createUser,
} from "../../support/fixtures.js";
import { loginAgent } from "../../support/http.js";
import {
  assertOwnerDbUnchanged,
  snapshotTicket,
} from "../../support/product-bola-helpers.js";

describe("product BOLA assignee mass assignment (tickets)", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("ticket.patch.assigneeId.foreignUser: foreign assigneeId returns 400 invalid_assignee", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const admin = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const foreignUser = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const ticket = await createTicket({
      orgId: orgA.id,
      title: "Assignee guard ticket",
      createdById: admin.id,
      assigneeId: null,
    });

    const client = await loginAgent(admin.email);
    const before = await snapshotTicket(ticket.id);

    await client
      .patch(`/tickets/${ticket.id}`)
      .set("Content-Type", "application/json")
      .send({ assigneeId: foreignUser.id })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe("invalid_assignee");
      });

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => snapshotTicket(ticket.id),
      expectEqual: (snapshotBefore, snapshotAfter) =>
        expect(snapshotAfter).toEqual(snapshotBefore),
    });
  });
});
