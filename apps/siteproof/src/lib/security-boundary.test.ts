/**
 * Guard rail: application code must never import the test-only loopback policy. Only *.test.ts files may.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("security boundary", () => {
  it("no non-test source file imports @repo/security/testing", () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => /@repo\/security\/testing|createLoopbackTestPolicy|internalCreateLoopbackPolicy/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
