import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261017210000_confirmation_maintenance_operation_claim_gate.sql",
  "utf8",
);
const preRequestGate = readFileSync(
  "supabase/migrations/20261017194000_confirmation_maintenance_readonly_gate.sql",
  "utf8",
);
const roundOperations = readFileSync(
  "supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql",
  "utf8",
);

describe("Confirmation maintenance operation-claim gate", () => {
  it("requires the exact pre-request transaction marker in read_only", () => {
    expect(migration).toContain(
      "coalesce(current_setting('studio2.confirmation_maintenance_write', true), '') = 'on'",
    );
    expect(preRequestGate).toContain(
      "set_config('studio2.confirmation_maintenance_write', 'on', true)",
    );
    expect(preRequestGate).toContain("'studio2_apply_confirmation_round_change'");
  });

  it("allows only existing-round maintenance commands", () => {
    for (const command of [
      "confirmation.round.status",
      "confirmation.round.editing",
      "confirmation.round.update",
    ]) {
      expect(migration).toContain(`'${command}'`);
    }

    expect(migration).not.toContain("'confirmation.round.create'");
    expect(migration).not.toContain("'confirmation.round.delete'");
  });

  it("keeps full maintenance mode closed to Confirmation commands", () => {
    const maintenanceBranch = migration.split("when 'maintenance' then")[1];
    expect(maintenanceBranch).toBeTruthy();
    expect(maintenanceBranch).not.toContain("confirmation.round.");
  });

  it("matches the command emitted by the canonical round operation", () => {
    expect(roundOperations).toContain("'confirmation.round.' || p_change_kind");
    expect(roundOperations).toContain("private.studio2_claim_operation(");
  });
});
