import { prisma } from "../lib/prisma.js";
import { resourceRef } from "./types.js";

/** Soft-redact in-app digests that referenced a revoked shared resource. */
export async function redactNotificationsForResource(input: {
  userId: string;
  resourceType: "TICKET" | "PULL_REQUEST";
  resourceId: string;
}): Promise<number> {
  const ref = resourceRef(
    input.resourceType === "TICKET" ? "ticket" : "pull_request",
    input.resourceId,
  );

  const result = await prisma.notification.updateMany({
    where: {
      userId: input.userId,
      redactedAt: null,
      resourceIds: { has: ref },
    },
    data: {
      redactedAt: new Date(),
      title: "Digest unavailable",
      body: "Some items are no longer shared with you.",
      facts: {},
      resourceIds: [],
    },
  });

  return result.count;
}

/** Redact all notifications for users who had grants on a connection that was revoked. */
export async function redactNotificationsForGrants(
  grants: Array<{
    grantedToUserId: string;
    resourceType: "TICKET" | "PULL_REQUEST";
    resourceId: string;
  }>,
): Promise<void> {
  for (const g of grants) {
    await redactNotificationsForResource({
      userId: g.grantedToUserId,
      resourceType: g.resourceType,
      resourceId: g.resourceId,
    });
  }
}
