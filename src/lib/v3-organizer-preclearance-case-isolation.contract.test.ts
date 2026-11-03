import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/admin/integrity-preclearance.tsx", "utf8");

describe("Preclearance case isolation", () => {
  it("keys the stateful ruling editor to the exact case identity", () => {
    expect(source).toContain("<RulingComposer key={detail.case.id} detail={detail} onChanged={onChanged} />");
  });

  it("does not present a fabricated clean privacy metric", () => {
    expect(source).not.toContain('label="Public leakage" value={0}');
  });
});
