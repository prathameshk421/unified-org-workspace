import { describe, expect, it } from "vitest";
import { withConnectTimeout } from "./database-url.js";

describe("withConnectTimeout", () => {
  it("appends connect_timeout when missing", () => {
    const out = withConnectTimeout(
      "postgresql://unified_app:pass@172.20.0.3:5432/unified_org",
    );
    expect(out).toContain("connect_timeout=60");
    expect(out).toContain("172.20.0.3");
  });

  it("does not override an existing connect_timeout", () => {
    const out = withConnectTimeout(
      "postgresql://unified_app:pass@172.20.0.3:5432/unified_org?connect_timeout=30",
    );
    expect(out).toContain("connect_timeout=30");
    expect(out).not.toContain("connect_timeout=60");
  });

  it("preserves passwords with reserved characters", () => {
    const raw =
      "postgresql://unified_app:p@ss:word/@172.20.0.3:5432/unified_org";
    expect(withConnectTimeout(raw)).toBe(`${raw}?connect_timeout=60`);
  });
});
