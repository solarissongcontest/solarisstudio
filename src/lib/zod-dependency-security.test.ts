import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const isPatched = (major: number, minor: number, patch: number) =>
  major > 4 || (major === 4 && (minor > 6 || (minor === 6 && patch >= 6)));

describe("Zod GHSA-mrhx-c7xc-m3w5 dependency regression", () => {
  it("keeps every direct and nested resolved Zod on a patched version", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { dependencies: { zod: string } };
    const lock = readFileSync(new URL("../../bun.lock", import.meta.url), "utf8");

    const declared = /^\\^?(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(manifest.dependencies.zod);
    expect(declared).not.toBeNull();
    expect(isPatched(...(declared!.slice(1).map(Number) as [number, number, number]))).toBe(true);

    const versions = [...lock.matchAll(/zod@(\\d+)\\.(\\d+)\\.(\\d+)/g)];
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(isPatched(...(version.slice(1).map(Number) as [number, number, number]))).toBe(true);
    }
  });

  it("enforces small public-facing array limits without accepting oversized ballots", () => {
    const schema = z.object({
      entries: z.array(z.object({ points: z.number().int().min(1) })).max(66),
    });
    expect(schema.safeParse({ entries: [{ points: 1 }] }).success).toBe(true);
    expect(schema.safeParse({ entries: Array.from({ length: 67 }, () => ({ points: 1 })) }).success).toBe(false);
  });
});
