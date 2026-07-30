import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_CELL_COUNT,
  PRODUCT_BOLA_CELLS,
} from "../../support/product-bola-matrix.js";

const INTEGRATION_ROOT = resolve(import.meta.dirname, "..");
const ALLOWED_SOFT_ASSERT_PATHS: string[] = [];

const POST_CONDITION_HELPERS = [
  "assertOwnerAliveAttackerDenyOwnerUnchanged",
  "assertOwnerDbUnchanged",
  "assertNoSuccessAuditForEntity",
] as const;

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("product BOLA matrix completeness (anti-cheat)", () => {
  it("EXPECTED_CELL_COUNT literal matches registry length", () => {
    expect(PRODUCT_BOLA_CELLS.length).toBe(EXPECTED_CELL_COUNT);
    expect(EXPECTED_CELL_COUNT).toBe(72);
  });

  it("every cell is covered with unique id and testTitle", () => {
    for (const cell of PRODUCT_BOLA_CELLS) {
      expect(cell.status).toBe("covered");
      expect(cell.pathPattern.includes("*")).toBe(false);
    }

    const ids = PRODUCT_BOLA_CELLS.map((c) => c.id);
    const titles = PRODUCT_BOLA_CELLS.map((c) => c.testTitle);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("every cell has matching it(title) in suiteFile", () => {
    for (const cell of PRODUCT_BOLA_CELLS) {
      const suitePath = join(INTEGRATION_ROOT, cell.suiteFile);
      const source = readFileSync(suitePath, "utf8");
      const escaped = escapeRegExp(cell.testTitle);
      const titleRe = new RegExp(
        String.raw`it\(\s*(["'])${escaped}\1`,
      );
      expect(
        titleRe.test(source),
        `Missing it("${cell.testTitle}") in ${cell.suiteFile}`,
      ).toBe(true);
    }
  });

  it("postCondition cells import required helpers", () => {
    for (const cell of PRODUCT_BOLA_CELLS) {
      if (cell.postCondition === "none") {
        continue;
      }
      const suitePath = join(INTEGRATION_ROOT, cell.suiteFile);
      const source = readFileSync(suitePath, "utf8");
      const hasHelper = POST_CONDITION_HELPERS.some((name) =>
        source.includes(name),
      );
      expect(
        hasHelper,
        `${cell.id} (${cell.postCondition}) in ${cell.suiteFile} must import a post-condition helper`,
      ).toBe(true);
    }
  });

  it("bans soft 403|404 asserts across tests/integration", () => {
    // Match call sites only — not this file's own pattern strings.
    const softUnion = /expect\(\s*\[\s*403\s*,\s*404\s*\]/;
    const softHelperCall = /expectIsolationDenied\s*\(/;
    const files = walkTsFiles(INTEGRATION_ROOT);

    for (const file of files) {
      const rel = file.slice(INTEGRATION_ROOT.length + 1);
      if (ALLOWED_SOFT_ASSERT_PATHS.includes(rel)) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      expect(
        softUnion.test(source),
        `Soft 403|404 status union found in ${rel}`,
      ).toBe(false);
      expect(
        softHelperCall.test(source),
        `Isolation soft-helper call found in ${rel}`,
      ).toBe(false);
    }
  });
});
