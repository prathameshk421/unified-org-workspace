import { beforeEach, describe, expect, it, vi } from "vitest";

const { digestEnv, prismaMock } = vi.hoisted(() => ({
  digestEnv: {
    emailEnabled: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpUser: "argus.unified.workspace@gmail.com" as string | undefined,
    smtpPass: "app-password" as string | undefined,
    smtpFrom: "Argus <argus.unified.workspace@gmail.com>",
    emailAllowlist: [] as string[],
    emailRedirectTo: undefined as string | undefined,
  },
  prismaMock: {
    notification: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("./env.js", () => ({
  digestEnv,
  DEFAULT_SMTP_FROM: "Argus <argus.unified.workspace@gmail.com>",
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import { inAppDispatcher } from "./dispatch.js";
import { resetDigestMailerCache } from "./email.js";
import type { DigestMailer } from "./email.js";

function mockMailer(): DigestMailer & { sendMail: ReturnType<typeof vi.fn> } {
  return {
    sendMail: vi.fn().mockResolvedValue(undefined),
  };
}

describe("deliverEmail", () => {
  beforeEach(() => {
    resetDigestMailerCache();
    vi.clearAllMocks();
    digestEnv.emailEnabled = true;
    digestEnv.smtpUser = "argus.unified.workspace@gmail.com";
    digestEnv.smtpPass = "app-password";
    digestEnv.emailAllowlist = [];
    digestEnv.emailRedirectTo = undefined;
    prismaMock.notification.findFirst.mockResolvedValue(null);
    prismaMock.notification.create.mockResolvedValue({ id: "n1" });
    prismaMock.user.findUnique.mockResolvedValue({
      email: "alice@acme.com",
    });
  });

  it("disabled → skipped, no send", async () => {
    digestEnv.emailEnabled = false;
    const mailer = mockMailer();

    const result = await inAppDispatcher.deliverEmail({
      userId: "u1",
      digestRunId: "r1",
      title: "Digest",
      body: "Hello",
      mailer,
    });

    expect(result).toBe("skipped");
    expect(mailer.sendMail).not.toHaveBeenCalled();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("redirect → sends only to redirect address", async () => {
    digestEnv.emailRedirectTo = "alt@whatever.com";
    const mailer = mockMailer();

    const result = await inAppDispatcher.deliverEmail({
      userId: "u1",
      digestRunId: "r1",
      title: "Digest",
      body: "Hello",
      mailer,
    });

    expect(result).toBe("created");
    expect(mailer.sendMail).toHaveBeenCalledWith({
      to: "alt@whatever.com",
      subject: "Digest",
      text: "Hello",
    });
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: "EMAIL",
          userId: "u1",
          digestRunId: "r1",
        }),
      }),
    );
  });

  it("allowlist → skips users not on list", async () => {
    digestEnv.emailAllowlist = ["temporary.hamesha.ka.group@gmail.com"];
    const mailer = mockMailer();

    const result = await inAppDispatcher.deliverEmail({
      userId: "u1",
      digestRunId: "r1",
      title: "Digest",
      body: "Hello",
      mailer,
    });

    expect(result).toBe("skipped");
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it("idempotent → existing EMAIL row skips send", async () => {
    prismaMock.notification.findFirst.mockResolvedValue({ id: "existing" });
    const mailer = mockMailer();

    const result = await inAppDispatcher.deliverEmail({
      userId: "u1",
      digestRunId: "r1",
      title: "Digest",
      body: "Hello",
      mailer,
    });

    expect(result).toBe("exists");
    expect(mailer.sendMail).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("send failure → soft-fail error (no throw)", async () => {
    const mailer = mockMailer();
    mailer.sendMail.mockRejectedValue(new Error("SMTP down"));

    const result = await inAppDispatcher.deliverEmail({
      userId: "u1",
      digestRunId: "r1",
      title: "Digest",
      body: "Hello",
      mailer,
    });

    expect(result).toBe("error");
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});
