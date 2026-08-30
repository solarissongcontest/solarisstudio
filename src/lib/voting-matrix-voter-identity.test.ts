import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  matchVoterKey,
  voterOptionsFromVoters,
  type Country,
  type JuryVote,
  type Voter,
} from "./data";

const ZENRYAH_ENTITY_ID = "26d93855-395e-48ee-b778-7040408d5d20";
const ZENRYAH_VOTER_ID = "829984fd-1e28-43b6-8da4-a4ea56f4f44e";

describe("VotingMatrix historical voter identity", () => {
  it("maps an entity-backed voter ballot onto its visible voter column", () => {
    const voters: Voter[] = [
      {
        id: ZENRYAH_VOTER_ID,
        edition_id: "214c898e-e252-4ad3-8767-42461f746fc6",
        show_id: "86f02456-7ebc-4533-aa5b-fd5aab3b75d6",
        country_id: null,
        contest_entity_id: ZENRYAH_ENTITY_ID,
        name: "Zenryah",
        kind: "country",
        flag_image: null,
        accent_color: "#8888aa",
        sort_order: 1,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    // Contest entities are deliberately structurally compatible with Country
    // on show-facing display maps. Their canonical id is the entity id.
    const displays: Country[] = [
      {
        id: ZENRYAH_ENTITY_ID,
        name: "Zenryah",
        native_name: null,
        short_code: "ZNR",
        flag_image: null,
        region: "Terra Solaris",
        accent_color: "#8888aa",
        description: null,
        first_participation: 7,
      },
    ];

    const options = voterOptionsFromVoters(voters, displays);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      key: `v:${ZENRYAH_VOTER_ID}`,
      countryId: ZENRYAH_ENTITY_ID,
      name: "Zenryah",
      short_code: "ZNR",
    });

    const archivedVote: JuryVote = {
      id: "00000000-0000-0000-0000-000000000001",
      edition_id: "214c898e-e252-4ad3-8767-42461f746fc6",
      show_id: "86f02456-7ebc-4533-aa5b-fd5aab3b75d6",
      voter_country_id: "",
      voter_id: null,
      voter_entity_id: ZENRYAH_ENTITY_ID,
      receiving_country_id: "00000000-0000-0000-0000-000000000002",
      points: 12,
    };

    expect(matchVoterKey(archivedVote, options)).toBe(`v:${ZENRYAH_VOTER_ID}`);
  });

  it("keeps VotingMatrix on the canonical voter resolver instead of rebuilding country-only identities", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/VotingMatrix.tsx"),
      "utf8",
    );

    expect(source).toContain("voterOptionsFromVoters(");
    expect(source).toContain("voterList.map((voter) => voter.key)");
    expect(source).not.toContain("countryId: v.country_id");
  });
});
