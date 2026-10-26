import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const client = source("src/integrations/confirmations/v3-projections.ts");
const responses = source("src/routes/confirmations/admin/responses.tsx");
const responseDetail = source("src/routes/confirmations/admin/responses/$id.tsx");
const recovery = source("src/routes/confirmations/admin/recovery-codes.tsx");
const responseMigration = source(
  "supabase/migrations/20261019212000_v3_confirmation_review_projection.sql",
);
const recoveryMigration = source(
  "supabase/migrations/20261019212100_v3_confirmation_recovery_projection.sql",
);

function capability(id: string) {
  return V3_ORGANIZER_CAPABILITY_REGISTRY.find((item) => item.legacyId === id);
}

describe("V3 Organizer exact-edition Confirmation projection cutovers", () => {
  it("uses only the exact-edition bounded response projection for the review queue", () => {
    expect(responses).toContain("loadConfirmationResponsesPage<ResponseRow>(editionId)");
    expect(responses).toContain("activeEditionRef.current !== requestedEditionId");
    expect(responses).toContain("setRows([])");
    expect(responses).toContain("responseCursor");
    expect(responses).not.toContain('rpc("admin_confirmation_responses")');
    expect(client).toContain('rpc("admin_confirmation_responses_v2"');
    expect(client).toContain("p_edition_id: editionId");
    expect(client).toContain("p_before_submitted_at");
    expect(client).toContain("Confirmation projection crossed the selected edition boundary");

    expect(responseMigration).toContain("submission.edition_id = p_edition_id");
    expect(responseMigration).toContain(
      "private.solaris_confirmation_admin_read_allowed(p_edition_id, false)",
    );
    expect(responseMigration).toContain("least(greatest(coalesce(p_limit, 100), 1), 200)");
    expect(responseMigration).toContain("'stateVersion', v_state_version");
  });

  it("keeps response mutations on the canonical versioned and receipted review authority", () => {
    expect(responseDetail).toContain("studio2_confirmation_entry_review_preview");
    expect(responseDetail).toContain("studio2_apply_confirmation_entry_review");
    expect(responseDetail).toContain("p_expected_version: preview.expectedVersion");
    expect(responseDetail).toContain("p_operation_id: command.operationId");
    expect(responseDetail).toContain("p_idempotency_key: command.idempotencyKey");
    expect(responseDetail).toContain("reconcileSystemOperation");
    expect(responseDetail).toContain("normalizeSystemReceipt");
    expect(responseDetail).toContain("await onChanged()");
    expect(responseDetail).toContain("studio2_confirmation_winner_change_preview");
    expect(responseDetail).toContain("studio2_apply_confirmation_winner_change");
  });

  it("loads recovery credentials only from the selected edition and clears them on scope change", () => {
    expect(recovery).toContain("loadConfirmationRecoveryCodesPage(editionId)");
    expect(recovery).toContain("setState(EMPTY_STATE)");
    expect(recovery).toContain("state.editionId === editionId");
    expect(recovery).toContain("activeEditionRef.current !== requestedEdition");
    expect(recovery).not.toContain("loadConfirmationRecoveryCodes()");
    expect(recovery).not.toContain("useQuery(");
    expect(client).toContain('rpc("admin_confirmation_recovery_codes_v2"');

    expect(recoveryMigration).toContain("submission.edition_id = p_edition_id");
    expect(recoveryMigration).toContain(
      "private.solaris_confirmation_admin_read_allowed(p_edition_id, false)",
    );
    expect(recoveryMigration).toContain("submission.recovery_code is not null");
    expect(recoveryMigration).toContain("least(greatest(coalesce(p_limit, 100), 1), 200)");
  });

  it("promotes only the two consumers whose exact-edition backend is now present", () => {
    expect(capability("delegation-confirmation-responses")?.migrationStatus).toBe("cutover");
    expect(capability("delegation-access")?.migrationStatus).toBe("cutover");
    expect(capability("delegation-submission-history")?.migrationStatus).toBe("building");
  });
});
