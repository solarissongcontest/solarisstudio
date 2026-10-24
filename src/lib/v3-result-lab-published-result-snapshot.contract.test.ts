import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/integrations/v3/result-lab-source.server.ts"),
  "utf8",
);

describe("V3 Result Lab immutable published Result authority", () => {
  it("uses the canonical published Result snapshot instead of mutable result rows", () => {
    expect(source).toContain(
      'import { loadV3PublishedResultSnapshot } from "@/integrations/v3/public-result-snapshot.server"',
    );
    expect(source).toContain("loadV3PublishedResultSnapshot(selectedShow.id)");
    expect(source).not.toContain('.from("results")');
    expect(source).not.toContain("RESULT_COLUMNS");
    expect(source).not.toContain("competingRows(");
  });

  it("fails closed when immutable publication evidence is missing or split Results are hidden", () => {
    expect(source).toContain("if (!snapshot)");
    expect(source).toContain(
      "if (!snapshot.availability.jury || !snapshot.availability.televote)",
    );
    expect(source).toContain(
      "Canonical published Result snapshot escaped the selected Edition scope",
    );
    expect(source).toContain(
      "Canonical published Result snapshot is missing public split points",
    );
    expect(source).not.toContain("juryPoints: 0");
    expect(source).not.toContain("televotePoints: 0");
  });

  it("maps official simulation inputs from immutable snapshot identity and score fields", () => {
    expect(source).toContain(
      'const id = row.contestEntityId ?? row.countryId ?? ""',
    );
    expect(source).toContain("juryPoints: row.juryPoints");
    expect(source).toContain("televotePoints: row.televotePoints");
    expect(source).toContain("officialRank: row.finalRank");
  });

  it("takes detailed-voting authority from the immutable publication snapshot", () => {
    expect(source).toContain(
      "const detailedVotingPublic = snapshot.availability.detailedVoting",
    );
    expect(source).toContain("if (detailedVotingPublic)");
    expect(source).toContain('.from("jury_votes")');
    expect(source).toContain('.from("voters")');
  });

  it("does not let current participation state rewrite immutable official result rows", () => {
    expect(source).not.toContain(
      'participant.participation_status === "withdrawn"',
    );
    expect(source).not.toContain(
      'participant.participation_status === "disqualified"',
    );
    expect(source).toContain(
      "const participantStates = parseParticipantStates(participantsResult.data)",
    );
    expect(source).toContain(
      "const participantIds = participantStates.map((participant) => participant.country_id)",
    );
  });
});
