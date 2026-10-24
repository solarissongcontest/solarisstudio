import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/integrations/televoting/editions.server.ts",
  "utf8",
);

describe("Organizer V3 Televoting edition authorization", () => {
  it("requires voting.read before listing edition and vote-count data", () => {
    const listStart = source.indexOf(
      "export async function listMergedTelevotingEditionsServer",
    );
    const createStart = source.indexOf(
      "export async function createMergedTelevotingEditionServer",
    );
    const listBody = source.slice(listStart, createStart);

    expect(listBody).toContain(
      'await requireSolarisCapabilityServer("voting.read", null);',
    );
    expect(listBody).not.toContain("requireMergedTelevotingAdminServer");
  });

  it("requires voting.manage before constructing the compatibility audit actor", () => {
    const manage = source.indexOf(
      'await requireSolarisCapabilityServer("voting.manage", null);',
    );
    const compatibilityActor = source.indexOf(
      "return requireMergedTelevotingAdminServer();",
    );

    expect(manage).toBeGreaterThan(-1);
    expect(compatibilityActor).toBeGreaterThan(manage);
  });

  it("routes every legacy edition mutation through the manage-capability actor helper", () => {
    for (const name of [
      "createMergedTelevotingEditionServer",
      "renameMergedTelevotingEditionServer",
      "activateMergedTelevotingEditionServer",
      "archiveMergedTelevotingEditionServer",
    ]) {
      const start = source.indexOf(`export async function ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      const next = source.indexOf("export async function ", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      expect(body, name).toContain("await requireVotingManageActor()");
    }
  });

  it("preserves active/archive guards while authorization is hardened", () => {
    expect(source).toContain("Unarchive the edition before activating it");
    expect(source).toContain(
      "Activate another edition before archiving the active one",
    );
  });
});
