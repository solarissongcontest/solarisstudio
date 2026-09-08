import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Voting rounds Worker-subrequest contract", () => {
  it("keeps ordinary rounds reads free of catalog synchronization and draft autosync", () => {
    const server = source("integrations/televoting/rounds.server.ts");

    expect(server).not.toContain("ensureCanonicalTelevotingEditionsServer");
    expect(server).not.toContain("autoSyncDraftTelevotingRoundsForEditionServer");
    expect(server).toContain("getMergedTelevotingRoundsForEditionServer");
    expect(server).toContain("getTelevotingEditionProjectionServer");
    expect(server).toContain("Promise.all([");
  });

  it("uses the Solaris Organizer edition context instead of a duplicate Televoting selector", () => {
    const page = source("components/televoting/VotingRoundsView.tsx");

    expect(page).toContain("useAdminContext");
    expect(page).toContain("getMergedTelevotingRoundsForEdition");
    expect(page).toContain('["merged-televoting-rounds", editionId]');
    expect(page).toContain("getRounds({ data: { editionId } })");
    expect(page).not.toContain("getMergedTelevotingAdmin");
    expect(page).not.toContain("<select");
  });

  it("resolves a round from its existing integration link instead of rebuilding every edition", () => {
    const sync = source("integrations/televoting/solaris-sync.server.ts");
    const resolveStart = sync.indexOf("async function resolveRoundSource");
    const resolveEnd = sync.indexOf("export async function getMergedRoundSolarisSourceServer");
    const resolver = sync.slice(resolveStart, resolveEnd);

    expect(resolver).toContain('.eq("remote_id", round.edition_id)');
    expect(resolver).toContain('.from("integration_links")');
    expect(resolver).not.toContain("ensureCanonicalTelevotingEditionsServer");
  });

  it("batches country and subtitle writes during an explicit Solaris line-up sync", () => {
    const sync = source("integrations/televoting/solaris-sync.server.ts");

    expect(sync).toContain("countryUpserts");
    expect(sync).toContain('.upsert(countryUpserts, { onConflict: "code" })');
    expect(sync).toContain("subtitleUpserts");
    expect(sync).toContain('.upsert(subtitleUpserts, { onConflict: "id" })');
    expect(sync).toContain("last_synced_revision: Number(source.edition.data_revision ?? 0)");
  });

  it("keeps the legacy all-editions loader available as a bounded read-only catalog", () => {
    const functions = source("integrations/televoting/rounds.functions.ts");
    const server = source("integrations/televoting/rounds.server.ts");

    expect(functions).toContain('getMergedTelevotingRounds = createServerFn({ method: "GET" })');
    expect(functions).toContain('getMergedTelevotingRoundsForEdition = createServerFn({ method: "POST" })');
    expect(server).toContain("remoteEditionResult");
    expect(server).toContain("linkBySolaris");
  });
});
