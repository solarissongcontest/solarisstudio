import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function creationBody() {
  const server = source("integrations/televoting/rounds.server.ts");
  return server.split("export async function createMergedTelevotingRoundServer(")[1]
    ?.split("export async function renameMergedTelevotingRoundServer(")[0] ?? "";
}

describe("Televoting draft creation Worker budget", () => {
  it("resolves only the selected linked edition with authoritative voting.manage", () => {
    const create = creationBody();
    expect(create).toContain('requireSolarisCapabilityServer("voting.manage", data.editionId)');
    expect(create).toContain('"admin_rounds_page_overview"');
    expect(create).toContain("p_solaris_edition_id: data.editionId");
    expect(create).toContain("overview.edition?.solaris_id !== data.editionId");
    expect(create).not.toContain("ensureCanonicalTelevotingEditionsServer");
    expect(create).not.toContain("syncMergedRoundFromSolarisServer");
    expect(create).not.toContain("autoSyncDraftTelevotingRoundsForEditionServer");
  });

  it("uses a stable client UUID and recovers only the same unchanged draft", () => {
    const create = creationBody();
    const serverFn = source("integrations/televoting/rounds.functions.ts");
    const view = source("components/televoting/VotingRoundsView.tsx");
    expect(serverFn).toContain("Valid round creation identity required");
    expect(create).toContain("id: data.roundId");
    expect(create).toContain('insertError?.code === "23505"');
    expect(create).toContain('existing.status !== "draft"');
    expect(create).toContain("existing.edition_id !== remoteEditionId");
    expect(create).toContain("existing.name !== data.name");
    expect(view).toContain("setDraftRoundId(crypto.randomUUID())");
    expect(view).toContain("roundId: draftRoundId");
    expect(view).toContain("Preserve draftRoundId across an uncertain response");
  });

  it("does not erase an existing binding or run lineup writes on a replay", () => {
    const create = creationBody();
    expect(create).toContain("if (replay)");
    expect(create).toContain("if (!alreadyBound)");
    expect(create).toContain("binding.remote_edition_id !== remoteEditionId");
    expect(create).toContain("binding.edition_id !== data.editionId");
    expect(create).toContain("auditId: row.id");
    expect(create).toContain("lineup_requires_configuration: true");
    expect(create).toContain("sync_warning: null");
  });
});
