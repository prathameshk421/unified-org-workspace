import nodemailer from "nodemailer";
import { digestEnv } from "./env.js";

export type DigestMailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type DigestMailer = {
  sendMail(message: DigestMailMessage): Promise<void>;
};

/**
 * Resolve the SMTP recipient for a digest user.
 * Returns null when the user should not receive email.
 *
 * Rules (in order):
 * 1. If DIGEST_EMAIL_REDIRECT_TO is set → that address only
 * 2. Else if DIGEST_EMAIL_ALLOWLIST is non-empty → user.email must be listed
 * 3. Else → user.email
 */
export function resolveDigestEmailRecipient(userEmail: string): string | null {
  const email = userEmail.trim();
  if (!email) return null;

  if (digestEnv.emailRedirectTo) {
    return digestEnv.emailRedirectTo;
  }

  if (digestEnv.emailAllowlist.length > 0) {
    const normalized = email.toLowerCase();
    if (!digestEnv.emailAllowlist.includes(normalized)) {
      return null;
    }
  }

  return email;
}

/** True when email channel is enabled and SMTP credentials are present. */
export function isDigestEmailConfigured(): boolean {
  return Boolean(
    digestEnv.emailEnabled && digestEnv.smtpUser && digestEnv.smtpPass,
  );
}

export function createNodemailerMailer(): DigestMailer {
  const transporter = nodemailer.createTransport({
    host: digestEnv.smtpHost,
    port: digestEnv.smtpPort,
    secure: false,
    auth: {
      user: digestEnv.smtpUser,
      pass: digestEnv.smtpPass,
    },
  });

  return {
    async sendMail(message) {
      await transporter.sendMail({
        from: digestEnv.smtpFrom,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

let cachedMailer: DigestMailer | null | undefined;

/** Lazy singleton — null when email is disabled / unconfigured. */
export function getDigestMailer(): DigestMailer | null {
  if (cachedMailer !== undefined) return cachedMailer;
  if (!isDigestEmailConfigured()) {
    cachedMailer = null;
    return null;
  }
  cachedMailer = createNodemailerMailer();
  return cachedMailer;
}

/** Test helper — reset singleton between cases. */
export function resetDigestMailerCache(): void {
  cachedMailer = undefined;
}
