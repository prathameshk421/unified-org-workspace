import { beforeEach, describe, expect, it, vi } from "vitest";

const { digestEnv } = vi.hoisted(() => ({
  digestEnv: {
    intervalHours: 3,
  },
}));

vi.mock("./env.js", () => ({ digestEnv }));

import { computeScheduledFor } from "./run.js";

describe("computeScheduledFor", () => {
  beforeEach(() => {
    digestEnv.intervalHours = 3;
  });

  it("floors to the start of the current 3-hour UTC bucket", () => {
    expect(computeScheduledFor(new Date("2026-08-01T00:00:00Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
    expect(computeScheduledFor(new Date("2026-08-01T02:59:59Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
    expect(computeScheduledFor(new Date("2026-08-01T03:00:00Z")).toISOString()).toBe(
      "2026-08-01T03:00:00.000Z",
    );
    expect(computeScheduledFor(new Date("2026-08-01T07:45:00Z")).toISOString()).toBe(
      "2026-08-01T06:00:00.000Z",
    );
  });
});
