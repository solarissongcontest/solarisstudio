import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-storage-byte-recovery-rehearsal.sh"),
  "utf8",
);

describe("System V3 S11 Storage delete API contract", () => {
  it("uses the Storage batch-delete endpoint with an explicit prefixes payload", () => {
    expect(rehearsal).toContain("delete_objects");
    expect(rehearsal).toContain(
      'request_json DELETE "$API_URL/storage/v1/object/$BUCKET"',
    );
    expect(rehearsal).toContain('json.dumps({"prefixes": sys.argv[1:]})');
    expect(rehearsal).not.toMatch(
      /DELETE\s+"\$API_URL\/storage\/v1\/object\/\$BUCKET\/\$key"/,
    );
    expect(rehearsal).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });

  it("proves metadata loss and records which deletion path was exercised", () => {
    expect(rehearsal).toContain(
      "object metadata remained after Storage API loss injection",
    );
    expect(rehearsal).toContain('"storageApiDeleteVerified": True');
  });
});
