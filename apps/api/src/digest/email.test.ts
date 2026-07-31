import { beforeEach, describe, expect, it, vi } from "vitest";

const { digestEnv } = vi.hoisted(() => ({
  digestEnv: {
    emailEnabled: false,
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpUser: "argus.unified.workspace@gmail.com" as string | undefined,
    smtpPass: "app-password" as string | undefined,
    smtpFrom: "Argus <argus.unified.workspace@gmail.com>",
    emailAllowlist: [] as string[],
    emailRedirectTo: undefined as string | undefined,
  },
}));

vi.mock("./env.js", () => ({
  digestEnv,
  DEFAULT_SMTP_FROM: "Argus <argus.unified.workspace@gmail.com>",
}));

import {
  isDigestEmailConfigured,
  resetDigestMailerCache,
  resolveDigestEmailRecipient,
} from "./email.js";

describe("digest email recipient rules", () => {
  beforeEach(() => {
    resetDigestMailerCache();
    digestEnv.emailEnabled = true;
    digestEnv.smtpUser = "argus.unified.workspace@gmail.com";
    digestEnv.smtpPass = "app-password";
    digestEnv.emailAllowlist = [];
    digestEnv.emailRedirectTo = undefined;
  });

  it("isDigestEmailConfigured is false when disabled", () => {
    digestEnv.emailEnabled = false;
    expect(isDigestEmailConfigured()).toBe(false);
  });

  it("isDigestEmailConfigured is false when SMTP creds missing", () => {
    digestEnv.smtpPass = undefined;
    expect(isDigestEmailConfigured()).toBe(false);
  });

  it("redirect overrides user email", () => {
    digestEnv.emailRedirectTo = "alt@example.com";
    expect(resolveDigestEmailRecipient("alice@acme.com")).toBe(
      "alt@example.com",
    );
  });

  it("allowlist skips users not listed", () => {
    digestEnv.emailAllowlist = ["temporary.hamesha.ka.group@gmail.com"];
    expect(resolveDigestEmailRecipient("alice@acme.com")).toBeNull();
    expect(resolveDigestEmailRecipient("temporary.hamesha.ka.group@gmail.com")).toBe(
      "temporary.hamesha.ka.group@gmail.com",
    );
  });

  it("allowlist is case-insensitive", () => {
    digestEnv.emailAllowlist = ["temporary.hamesha.ka.group@gmail.com"];
    expect(resolveDigestEmailRecipient("Temporary.Hamesha.Ka.Group@gmail.com")).toBe(
      "Temporary.Hamesha.Ka.Group@gmail.com",
    );
  });

  it("no allowlist / no redirect → user email", () => {
    expect(resolveDigestEmailRecipient("alice@acme.com")).toBe(
      "alice@acme.com",
    );
  });
});
