import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MATRIX_PATH = "docs/mobile-v2/completion-matrix.yml";
const VALID_STATUSES = new Set(["verified", "implemented", "partial", "manual_gate"]);

function matrixSource() {
  return readFileSync(MATRIX_PATH, "utf8");
}

function entries() {
  const source = matrixSource();
  return [...source.matchAll(/- \{ id: (\d+), name: ([^,]+), status: ([^,]+), release_blocking: (true|false), evidence: \[(.*?)\] \}/g)]
    .map((match) => ({
      id: Number(match[1]),
      name: match[2]!.trim(),
      status: match[3]!.trim(),
      releaseBlocking: match[4] === "true",
      evidence: match[5]!.trim(),
    }));
}

describe("Mobile App V2 completion ledger", () => {
  it("tracks every one of the 72 master-plan sections exactly once", () => {
    const rows = entries();
    expect(rows).toHaveLength(72);
    expect(new Set(rows.map((row) => row.id)).size).toBe(72);
    expect(rows.map((row) => row.id).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 72 }, (_, index) => index + 1),
    );
  });

  it("uses only reviewable completion states and never hides a missing item", () => {
    const rows = entries();
    for (const row of rows) {
      expect(VALID_STATUSES.has(row.status), `${row.id} ${row.name}: ${row.status}`).toBe(true);
      expect(row.status).not.toBe("missing");
    }
  });

  it("requires code evidence for every non-manual implemented or verified gate", () => {
    const missingEvidence = entries()
      .filter((row) => row.releaseBlocking)
      .filter((row) => row.status === "verified" || row.status === "implemented")
      .filter((row) => !row.evidence);
    expect(missingEvidence).toEqual([]);
  });

  it("keeps physical-device and production certification explicit manual gates", () => {
    const byId = new Map(entries().map((row) => [row.id, row]));
    expect(byId.get(68)).toMatchObject({ status: "manual_gate", releaseBlocking: true });
    expect(byId.get(71)).toMatchObject({ status: "manual_gate", releaseBlocking: true });
  });
});
