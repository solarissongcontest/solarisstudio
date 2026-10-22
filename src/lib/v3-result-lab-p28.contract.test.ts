import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 P28 Result Lab", () => {
  it("keeps official inputs server-owned and simulation math on the existing pure engine", () => {
    const source = read("src/integrations/v3/result-lab-source.server.ts");
    const screen = read("src/components/v3/V3ResultLabScreen.tsx");
    const functions = read("src/lib/v3-result-lab.functions.ts");

    expect(functions).toContain('createServerFn({ method: "GET" })');
    expect(source).toContain("createConfirmationPublicRuntimeClient");
    expect(screen).toContain("simulateResultLab({");
    expect(screen).toContain("officialEntries: bundle.officialEntries");
    expect(screen).toContain("juryVotes: bundle.detailedVotingPublic ? bundle.juryVotes : []");
  });

  it("requires official jury and televote result publication for eligible shows", () => {
    const source = read("src/integrations/v3/result-lab-source.server.ts");

    expect(source).toContain("publication.results === true");
    expect(source).toContain("publication.jury_results === true");
    expect(source).toContain("publication.televote_results === true");
    expect(source).toContain("eligibleShows.find((show) => show.id === requestedShowId)");
  });

  it("only exposes individual jury ballots when detailed voting is public", () => {
    const source = read("src/integrations/v3/result-lab-source.server.ts");

    expect(source).toContain("const detailedVotingPublic = publication.detailed_voting === true");
    expect(source).toContain("if (detailedVotingPublic)");
    expect(source).toContain('.from("jury_votes")');
    expect(source).toContain('.from("voters")');
    expect(source).toContain("matchVoterKey(vote, voterOptions)");
    expect(source).toContain("resolveShowVoters(rawVoters, participantIds, countries)");
  });

  it("filters non-competing result placeholders before building official entries", () => {
    const source = read("src/integrations/v3/result-lab-source.server.ts");

    expect(source).toContain('client.rpc("public_safe_participants"');
    expect(source).toContain('participant.participation_status === "withdrawn"');
    expect(source).toContain('participant.participation_status === "disqualified"');
    expect(source).toContain("competingRows(");
  });

  it("keeps the official source strictly read-only", () => {
    const combined = [
      read("src/integrations/v3/result-lab-source.server.ts"),
      read("src/lib/v3-result-lab.functions.ts"),
      read("src/lib/v3-result-lab-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain(".insert(");
    expect(combined).not.toContain(".update(");
    expect(combined).not.toContain(".delete(");
    expect(combined).not.toContain(".upsert(");
    expect(combined).not.toContain("service_role");
  });

  it("labels every scenario as hypothetical and never claims to replace official truth", () => {
    const screen = read("src/components/v3/V3ResultLabScreen.tsx");

    expect(screen).toContain('data-v3-result-lab-hypothetical=""');
    expect(screen).toContain("Simulation");
    expect(screen).toContain("Official result unchanged");
    expect(screen).toContain("Everything below is hypothetical");
    expect(screen).toContain("never writes");
    expect(screen).toContain("Hypothetical scoreboard");
  });

  it("shares only bounded hypothetical controls while server authority revalidates the show", () => {
    const scenario = read("src/lib/v3-result-lab-scenario.ts");
    const gate = read("src/components/v3/V3ResultLabGate.tsx");
    const screen = read("src/components/v3/V3ResultLabScreen.tsx");

    expect(gate).toContain("parseV3ResultLabScenario(searchStr)");
    expect(gate).toContain("useV3ResultLabBundle(selectedShowId, true)");
    expect(screen).toContain("serializeV3ResultLabScenario({");
    expect(screen).toContain('data-v3-result-lab-share=""');
    expect(screen).toContain("Official result unchanged.");
    expect(scenario).toContain("slice(0, 50)");
    expect(scenario).not.toMatch(/officialEntries|juryPoints|televotePoints|simulatedScore/);
  });

  it("uses Results rollout authority and preserves the established route as fallback", () => {
    const gate = read("src/components/v3/V3ResultLabGate.tsx");
    const route = read("src/routes/result-lab/index.tsx");

    expect(gate).toContain("useV3EditionRolloutProbe");
    expect(gate).toContain("useV3RolloutProbe");
    expect(gate).toContain("rollout.data.resultsEnabled !== true");
    expect(gate).toContain("return <>{fallback}</>");
    expect(route).toContain("isAppMode");
    expect(route).toContain("<V3ResultLabGate fallback={<LegacyResultLabPage />} />");
    expect(route).toContain("return <LegacyResultLabPage />");
  });

  it("does not expose a browser-controlled rollout or write path", () => {
    const combined = [
      read("src/components/v3/V3ResultLabGate.tsx"),
      read("src/components/v3/V3ResultLabScreen.tsx"),
      read("src/lib/v3-result-lab-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain("localStorage");
    expect(combined).not.toContain("sessionStorage");
    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_RESULT_LAB");
    expect(combined).not.toContain("window.location.search");
    expect(combined).not.toContain(".insert(");
    expect(combined).not.toContain(".update(");
  });
});
