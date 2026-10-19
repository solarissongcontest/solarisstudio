import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const stage3 = source(".github/scripts/v3-s14-stage-3-confirmations.sh");
const confirmationSecurity = source(".github/scripts/v3-confirmation-security-rehearsal.sh");
const confirmationAuthority = source(
  "supabase/migrations/20261012010000_v3_confirmation_authority.sql",
);

describe("S14 Confirmation reconciliation response shape", () => {
  it("reads the replay receipt from the canonical top-level reconciliation envelope", () => {
    expect(confirmationAuthority).toContain("operation.result || jsonb_build_object(");
    expect(confirmationAuthority).toContain("'found', true");
    expect(confirmationAuthority).toContain("'receipt', jsonb_build_object(");
    expect(confirmationSecurity).toContain(
      'expect_json "reconciliation marked replay" receipt.replayed true',
    );
    expect(stage3).toContain(
      'expect_json "post-commit confirmation recovery is a replay" receipt.replayed true',
    );
    expect(stage3).not.toContain("result.receipt.replayed");
  });
});
