import type { NotificationDto } from "@unified/types";
import { prisma } from "../../lib/prisma.js";

export class NotificationCursorError extends Error {}

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};

export function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type as NotificationDto["type"],
    title: row.title,
    body: row.body,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const dtoSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  readAt: true,
  createdAt: true,
} as const;

export async function listNotifications(
  userId: string,
  opts: { limit: number; cursor?: string; unreadOnly?: boolean },
): Promise<{ items: NotificationDto[]; nextCursor: string | null }> {
  if (opts.cursor) {
    const ownedCursor = await prisma.notification.findFirst({
      where: {
        id: opts.cursor,
        userId,
        channel: "IN_APP",
        redactedAt: null,
      },
      select: { id: true },
    });
    if (!ownedCursor) {
      throw new NotificationCursorError("Invalid notification cursor");
    }
  }

  const items = await prisma.notification.findMany({
    where: {
      userId,
      channel: "IN_APP",
      redactedAt: null,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor
      ? {
          cursor: { id: opts.cursor },
          skip: 1,
        }
      : {}),
    select: dtoSelect,
  });

  const page = items.slice(0, opts.limit);
  const hasMore = items.length > opts.limit;

  return {
    items: page.map(toNotificationDto),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, channel: "IN_APP", readAt: null, redactedAt: null },
  });
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, redactedAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, redactedAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
