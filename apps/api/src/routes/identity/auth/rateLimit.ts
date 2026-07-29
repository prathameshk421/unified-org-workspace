import type { NextFunction, Request, Response } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

function getClientKey(req: Request, email?: string): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  return email ? `${ip}:${email.toLowerCase()}` : ip;
}

export function createRateLimiter(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const email =
      typeof req.body?.email === "string" ? req.body.email : undefined;
    const key = `${scope}:${getClientKey(req, email)}`;
    const now = Date.now();

    const entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      next();
      return;
    }

    if (entry.count >= MAX_REQUESTS) {
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }

    entry.count += 1;
    next();
  };
}
