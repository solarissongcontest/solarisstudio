import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const shell = readFileSync(
  "src/integrations/confirmations/sync-submission.functions.ts",
  "utf8",
);

describe("Organizer V3 Confirmation canonical sync authorization", () => {
  it("requires the named confirmation.manage capability", () => {
    expect(shell).toContain(
      'await requireSolarisCapabilityServer("confirmation.manage", null);',
    );
    expect(shell).not.toContain("requireSolarisOrganizerServer");
  });

  it("authorizes before loading the privileged reconciliation implementation", () => {
    const guard = shell.indexOf(
      'await requireSolarisCapabilityServer("confirmation.manage", null);',
    );
    const privilegedImport = shell.indexOf(
      '"@/integrations/confirmations/sync.functions"',
    );
    const execute = shell.indexOf(
      "return syncConfirmationSubmissionToSolarisInternal(data.submissionId);",
    );

    expect(guard).toBeGreaterThan(-1);
    expect(privilegedImport).toBeGreaterThan(guard);
    expect(execute).toBeGreaterThan(privilegedImport);
  });

  it("keeps caller input limited to the validated submission id", () => {
    expect(shell).toContain("return { submissionId };");
    expect(shell).not.toContain("actorId");
    expect(shell).not.toContain("userId");
    expect(shell).not.toContain("editionId");
  });
});
