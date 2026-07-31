import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  getUnreadCount,
  listNotifications,
} from "./service.js";

describe("notifications bell filter (IN_APP only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.notification.count.mockResolvedValue(0);
  });

  it("listNotifications scopes to channel IN_APP", async () => {
    await listNotifications("user-1", { limit: 20 });

    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          channel: "IN_APP",
          redactedAt: null,
        }),
      }),
    );
  });

  it("getUnreadCount scopes to channel IN_APP", async () => {
    await getUnreadCount("user-1");

    expect(prismaMock.notification.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        channel: "IN_APP",
        readAt: null,
        redactedAt: null,
      },
    });
  });
});
