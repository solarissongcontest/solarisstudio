import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Voting rounds Worker subrequest contract", () => {
  it("loads only the Organizer-selected edition", () => {
    const view = source("components/televoting/VotingRoundsView.tsx");
    const functions = source("integrations/televoting/rounds.functions.ts");

    expect(view).toContain("useAdminContext");
    expect(view).toContain('["merged-televoting-rounds", editionId]');
    expect(view).toContain("getRounds({ data: { editionId } })");
    expect(view).not.toContain("<select");
    expect(functions).toContain('createServerFn({ method: "POST" })');
    expect(functions).toContain("getMergedTelevotingRoundsServer(data.editionId)");
  });

  it("does not reconcile the full edition archive or auto-sync drafts on read", () => {
    const server = source("integrations/televoting/rounds.server.ts");
    const readStart = server.indexOf("export async function getMergedTelevotingRoundsServer");
    const createStart = server.indexOf("export async function createMergedTelevotingRoundServer");
    const readPath = server.slice(readStart, createStart);

    expect(readPath).toContain("resolveSelectedEditionProjectionServer(solarisEditionId)");
    expect(readPath).toContain('.eq("edition_id", edition.id)');
    expect(readPath).not.toContain("ensureCanonicalTelevotingEditionsServer");
    expect(readPath).not.toContain("autoSyncDraftTelevotingRoundsForEditionServer");
    expect(readPath).not.toContain("for (const edition");
  });

  it("creates a round through the same selected-edition resolver", () => {
    const server = source("integrations/televoting/rounds.server.ts");

    expect(server).toContain("resolveSelectedEditionProjectionServer(data.solarisEditionId)");
    expect(server).toContain("solaris_edition_id: edition.solaris_id");
  });
});
