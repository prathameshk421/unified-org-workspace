import { SignJWT } from "jose";
import type { OrgRole } from "@unified/types";
import type { Response } from "supertest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/lib/env.js";
import { ownerDb } from "./db.js";

export function agent() {
  return request.agent(createApp());
}

export interface ParsedCookie {
  value: string;
  httpOnly?: boolean;
  sameSite?: string;
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
}

function parseCookiePair(pair: string): ParsedCookie | null {
  const parts = pair.split(";").map((part) => part.trim());
  const [nameValue, ...attrs] = parts;
  const eq = nameValue?.indexOf("=");
  if (eq === undefined || eq < 0) {
    return null;
  }

  const parsed: ParsedCookie = {
    value: decodeURIComponent(nameValue.slice(eq + 1)),
  };

  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower === "httponly") {
      parsed.httpOnly = true;
    } else if (lower.startsWith("samesite=")) {
      parsed.sameSite = attr.split("=")[1];
    } else if (lower.startsWith("path=")) {
      parsed.path = attr.split("=")[1];
    } else if (lower.startsWith("domain=")) {
      parsed.domain = attr.split("=")[1];
    } else if (lower.startsWith("max-age=")) {
      parsed.maxAge = Number.parseInt(attr.split("=")[1] ?? "", 10);
    } else if (lower.startsWith("expires=")) {
      parsed.expires = new Date(attr.slice("expires=".length));
    }
  }

  return parsed;
}

export function parseSetCookie(res: Response, cookieName?: string): Record<string, ParsedCookie> {
  const header = res.headers["set-cookie"];
  const cookies: Record<string, ParsedCookie> = {};

  if (!header) {
    return cookies;
  }

  const list = Array.isArray(header) ? header : [header];

  for (const raw of list) {
    const name = raw.split("=")[0]?.trim();
    if (!name) {
      continue;
    }
    const parsed = parseCookiePair(raw);
    if (parsed) {
      cookies[name] = parsed;
    }
  }

  if (cookieName) {
    return { [cookieName]: cookies[cookieName]! };
  }

  return cookies;
}

export async function mintToken(
  claims: {
    sub: string;
    sid: string;
    activeOrgId?: string | null;
    role?: OrgRole | null;
    isPlatformAdmin?: boolean;
  },
  options?: { expiresIn?: string; secret?: string },
): Promise<string> {
  const secret = new TextEncoder().encode(options?.secret ?? env.jwtSecret);

  return new SignJWT({
    jti: crypto.randomUUID(),
    sid: claims.sid,
    activeOrgId: claims.activeOrgId ?? null,
    role: claims.role ?? null,
    isPlatformAdmin: claims.isPlatformAdmin ?? false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(options?.expiresIn ?? `${env.accessTokenTtlSeconds}s`)
    .sign(secret);
}

export async function waitForAudit(
  predicate: (row: {
    action: string;
    userId: string | null;
    orgId: string | null;
    entityType: string;
    entityId: string;
  }) => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const rows = await ownerDb.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        action: true,
        userId: true,
        orgId: true,
        entityType: true,
        entityId: true,
      },
    });

    if (rows.some(predicate)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for audit row");
}

export async function loginAgent(
  email: string,
  password = "password123",
): Promise<ReturnType<typeof agent>> {
  const client = agent();
  await client
    .post("/auth/login")
    .set("Content-Type", "application/json")
    .send({ email, password })
    .expect(200);
  return client;
}
