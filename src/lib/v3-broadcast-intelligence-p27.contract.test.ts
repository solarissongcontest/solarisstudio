import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 P27 Broadcast Intelligence", () => {
  it("derives Broadcast Intelligence on the server from existing canonical engines", () => {
    const source = read("src/integrations/v3/broadcast-intelligence-source.server.ts");
    const functions = read("src/lib/v3-broadcast-intelligence.functions.ts");

    expect(functions).toContain('createServerFn({ method: "GET" })');
    expect(source).toContain("broadcastEntriesFromResults");
    expect(source).toContain("buildBroadcastIntelligence");
    expect(source).toContain("createConfirmationPublicRuntimeClient");
  });

  it("requires result, jury and televote publication before a show can be selected", () => {
    const source = read("src/integrations/v3/broadcast-intelligence-source.server.ts");

    expect(source).toContain("publication.results === true");
    expect(source).toContain("publication.jury_results === true");
    expect(source).toContain("publication.televote_results === true");
    expect(source).toContain("eligibleShows.find((show) => show.id === requestedShowId)");
    expect(source).toContain("await loadPublicResultSnapshots(client, [selectedShow.id])");
    expect(source).toContain("snapshot.publicationVersion !== snapshots.get(selectedShow.id)!.publicationVersion");
    expect(source).toContain("snapshot.rows");
    expect(source).not.toContain('.from("results")');
  });

  it("uses the immutable published participant set instead of re-filtering historical truth by the current lineup", () => {
    const source = read("src/integrations/v3/broadcast-intelligence-source.server.ts");
    expect(source).toContain("const rows = snapshot.rows");
    expect(source).toContain("snapshot?.editionId === show.edition_id");
    expect(source).not.toContain('client.rpc("public_safe_participants"');
    expect(source).not.toContain("filterNonCompetingRows(");
  });

  it("keeps the source show-scoped and read-only", () => {
    const combined = [
      read("src/integrations/v3/broadcast-intelligence-source.server.ts"),
      read("src/lib/v3-broadcast-intelligence.functions.ts"),
      read("src/lib/v3-broadcast-intelligence-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain(".insert(");
    expect(combined).not.toContain(".update(");
    expect(combined).not.toContain(".delete(");
    expect(combined).not.toContain(".upsert(");
    expect(combined).not.toContain("service_role");
  });

  it("states that generated replay is not exact historical broadcast authority", () => {
    const screen = read("src/components/v3/V3BroadcastIntelligenceScreen.tsx");

    expect(screen).toContain('data-v3-broadcast-replay-disclaimer=""');
    expect(screen).toContain("deterministically reconstructed from official published");
    expect(screen).toContain("does not claim to reproduce the exact");
    expect(screen).toContain("replayProgress(bundle.entries, replayStep)");
    expect(screen).toContain("Next reveal");
    expect(screen).toContain("Auto play");
    expect(screen).toContain("Jury to final comparison");
  });

  it("uses Results rollout authority and preserves the established route as fallback", () => {
    const gate = read("src/components/v3/V3BroadcastIntelligenceGate.tsx");
    const route = read("src/routes/broadcast-intelligence/index.tsx");

    expect(gate).toContain("useV3EditionRolloutProbe");
    expect(gate).toContain("useV3RolloutProbe");
    expect(gate).toContain("rollout.data.resultsEnabled !== true");
    expect(gate).toContain("return <>{fallback}</>");
    expect(route).toContain("isAppMode");
    expect(route).toContain("<V3BroadcastIntelligenceGate");
    expect(route).toContain("fallback={<LegacyBroadcastIntelligencePage />}");
    expect(route).toContain("return <LegacyBroadcastIntelligencePage />");
  });

  it("does not expose a browser-controlled rollout or publication escape hatch", () => {
    const combined = [
      read("src/components/v3/V3BroadcastIntelligenceGate.tsx"),
      read("src/components/v3/V3BroadcastIntelligenceScreen.tsx"),
      read("src/lib/v3-broadcast-intelligence-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain("localStorage");
    expect(combined).not.toContain("sessionStorage");
    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_BROADCAST_INTELLIGENCE");
    expect(combined).not.toContain("window.location.search");
    expect(combined).not.toContain("useResults(");
    expect(combined).not.toContain("useAllContestEntities(");
  });
});
