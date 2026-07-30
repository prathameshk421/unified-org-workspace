import type { NextFunction, Request, Response } from "express";
import { AuditAction } from "@unified/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { record } = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/audit-log.js", () => ({
  record,
}));

import {
  auditMutations,
  markAuditWritten,
  queueAudit,
} from "./audit-mutations.js";

function runMutation(
  method: string,
  path: string,
  setup?: (req: Request, res: Response) => void,
  statusCode = 200,
) {
  const req = {
    method,
    path,
    auth: { userId: "user-1", activeOrgId: "org-1" },
    orgId: "org-1",
  } as unknown as Request;

  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    statusCode,
    locals: {} as Response["locals"],
    on(event: string, handler: () => void) {
      listeners[event] ??= [];
      listeners[event]!.push(handler);
      return this;
    },
  } as unknown as Response;

  setup?.(req, res);

  const next = vi.fn() as NextFunction;
  auditMutations(req, res, next);
  expect(next).toHaveBeenCalled();

  for (const handler of listeners.finish ?? []) {
    handler();
  }

  return { req, res };
}

describe("auditMutations", () => {
  beforeEach(() => {
    record.mockClear();
  });

  it("skips GET requests", () => {
    const req = { method: "GET", path: "/auth/me" } as Request;
    const res = { on: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    auditMutations(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.on).not.toHaveBeenCalled();
  });

  it("skips /health and /auth/refresh", () => {
    runMutation("POST", "/health");
    runMutation("POST", "/auth/refresh");
    expect(record).not.toHaveBeenCalled();
  });

  it("does not write audit rows for failed responses", () => {
    runMutation("POST", "/auth/login", undefined, 401);
    expect(record).not.toHaveBeenCalled();
  });

  it("flushes queued audit events", async () => {
    const { res } = runMutation("POST", "/auth/login", (_req, response) => {
      queueAudit(_req, response, {
        action: AuditAction.AUTH_LOGIN,
        entityType: "user",
        entityId: "user-1",
      });
    });

    await vi.waitFor(() => {
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.AUTH_LOGIN,
          entityType: "user",
          entityId: "user-1",
        }),
      );
    });

    expect(res.locals.auditWritten).toBeUndefined();
  });

  it("markAuditWritten prevents fallback http.mutation row", async () => {
    runMutation("POST", "/auth/login", (_req, response) => {
      markAuditWritten(response);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(record).not.toHaveBeenCalled();
  });

  it("writes fallback http.mutation when no explicit audit queued", async () => {
    runMutation("POST", "/auth/login");

    await vi.waitFor(() => {
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.HTTP_MUTATION,
          entityType: "http",
          entityId: "POST:/auth/login",
        }),
      );
    });
  });
});
