import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  resourceIdsFromFacts,
  type DigestFacts,
} from "./types.js";

export type NotificationDispatcher = {
  deliverInApp(input: {
    userId: string;
    digestRunId: string;
    title: string;
    body: string;
    facts: DigestFacts;
  }): Promise<"created" | "exists">;
};

export const inAppDispatcher: NotificationDispatcher = {
  async deliverInApp(input) {
    try {
      await prisma.notification.create({
        data: {
          userId: input.userId,
          digestRunId: input.digestRunId,
          type: "DIGEST",
          channel: "IN_APP",
          title: input.title,
          body: input.body,
          facts: input.facts as unknown as Prisma.InputJsonValue,
          resourceIds: resourceIdsFromFacts(input.facts),
        },
      });
      return "created";
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return "exists";
      }
      throw err;
    }
  },
};
