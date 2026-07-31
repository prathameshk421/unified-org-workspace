import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  getDigestMailer,
  isDigestEmailConfigured,
  resolveDigestEmailRecipient,
  type DigestMailer,
} from "./email.js";
import {
  resourceIdsFromFacts,
  type DigestFacts,
} from "./types.js";

export type InAppDeliverResult = "created" | "exists";
export type EmailDeliverResult = "created" | "exists" | "skipped" | "error";

export type NotificationDispatcher = {
  deliverInApp(input: {
    userId: string;
    digestRunId: string;
    title: string;
    body: string;
    facts: DigestFacts;
  }): Promise<InAppDeliverResult>;
  deliverEmail(input: {
    userId: string;
    digestRunId: string;
    title: string;
    body: string;
    mailer?: DigestMailer | null;
  }): Promise<EmailDeliverResult>;
};

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002",
  );
}

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
      if (isUniqueViolation(err)) {
        return "exists";
      }
      throw err;
    }
  },

  async deliverEmail(input) {
    try {
      if (!isDigestEmailConfigured()) {
        return "skipped";
      }

      const existing = await prisma.notification.findFirst({
        where: {
          userId: input.userId,
          digestRunId: input.digestRunId,
          type: "DIGEST",
          channel: "EMAIL",
        },
        select: { id: true },
      });
      if (existing) {
        return "exists";
      }

      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });
      if (!user?.email) {
        return "skipped";
      }

      const to = resolveDigestEmailRecipient(user.email);
      if (!to) {
        return "skipped";
      }

      const mailer =
        input.mailer !== undefined ? input.mailer : getDigestMailer();
      if (!mailer) {
        return "skipped";
      }

      await mailer.sendMail({
        to,
        subject: input.title,
        text: input.body,
      });

      try {
        await prisma.notification.create({
          data: {
            userId: input.userId,
            digestRunId: input.digestRunId,
            type: "DIGEST",
            channel: "EMAIL",
            title: input.title,
            body: input.body,
            facts: {} as Prisma.InputJsonValue,
            resourceIds: [],
          },
        });
        return "created";
      } catch (err) {
        if (isUniqueViolation(err)) {
          return "exists";
        }
        throw err;
      }
    } catch {
      return "error";
    }
  },
};
