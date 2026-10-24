import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/integrations/televoting/moderation.server.ts",
  "utf8",
);

describe("Organizer V3 Televote moderation authorization", () => {
  it("requires ballot-read capability for private ballot and alert reads", () => {
    expect(source).toContain(
      'requireSolarisCapabilityServer("televote.ballots.read", null)',
    );
    expect(source).toContain("await requireBallotRead();");
  });

  it("requires ballot-manage capability before compatibility admin identity", () => {
    const manage = source.indexOf(
      'await requireSolarisCapabilityServer("televote.ballots.manage", null);',
    );
    const compatibilityAdmin = source.indexOf(
      "return requireMergedTelevotingAdminServer();",
    );

    expect(manage).toBeGreaterThan(-1);
    expect(compatibilityAdmin).toBeGreaterThan(manage);
  });

  it("routes every ballot mutation through the manage-capability actor helper", () => {
    const mutationFunctions = [
      "setMergedSubmissionStatusServer",
      "softDeleteMergedSubmissionServer",
      "restoreMergedSubmissionServer",
      "updateMergedSubmissionNoteServer",
      "editMergedSubmissionEntriesServer",
    ];

    for (const name of mutationFunctions) {
      const start = source.indexOf(`export async function ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      const nextExport = source.indexOf("export async function ", start + 1);
      const body = source.slice(start, nextExport === -1 ? undefined : nextExport);
      expect(body, name).toContain("await requireBallotManageActor()");
    }
  });

  it("does not use the compatibility admin gate as the read authorization decision", () => {
    const listStart = source.indexOf(
      "export async function listMergedModerationSubmissionsServer",
    );
    const firstMutation = source.indexOf(
      "export async function setMergedSubmissionStatusServer",
    );
    const listBody = source.slice(listStart, firstMutation);

    expect(listBody).toContain("await requireBallotRead();");
    expect(listBody).not.toContain("requireMergedTelevotingAdminServer");
  });
});
