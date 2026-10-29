import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function check(input: unknown) {
  return spawnSync("python3", [".github/scripts/check-v3-activity-response.py"], {
    input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8",
  });
}

describe("required recipient Activity HTTP privacy assertion", () => {
  it("accepts the narrow public receipt identity without requiring ripgrep", () => {
    expect(check({ items: [{ id: "operation", receipt_id: "receipt", source_event_type: "jury.ballot_submitted" }] }).status).toBe(0);
  });
  for (const key of ["request_hash", "request_fingerprint", "ballot_submission_id", "target_country_id", "rankings", "idempotency_key"]) {
    it(`rejects nested ${key} even after successful RPC execution`, () => {
      const result = check({ items: [{ id: "operation", detail: { [key]: "private" } }] });
      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain("private");
    });
  }
  it("fails closed on invalid JSON or a missing projection", () => {
    for (const input of ["not json", {}, { items: null }, []]) expect(check(input).status).toBe(1);
  });
});
