import { describe, expect, it } from "vitest";

import { loadStudio2CountryCockpit } from "./studio2-country-cockpit";

function cockpitRow(editionId: string) {
  return {
    editionId,
    editionName: "SSC 22",
    countryId: "country-oland",
    countryName: "Oland",
    confirmationComplete: true,
    participantStatus: "confirmed",
    publicationStatus: "published",
    entry: {
      id: "entry-1",
      artist: "Artist",
      songTitle: "Song",
      songUrl: "https://example.com/song",
      status: "confirmed",
      source: "confirmations",
      metadata: {},
      createdAt: "2026-10-16T10:00:00Z",
      updatedAt: "2026-10-16T10:01:00Z",
    },
    juryMembersRequired: 1,
    juryMembersAssigned: 1,
    juryMembers: [
      {
        id: "hod-1",
        displayName: "Oland HOD",
        memberUserId: "user-1",
        createdAt: "2026-10-16T09:00:00Z",
      },
    ],
    juryBallotSubmitted: true,
    notices: [],
    deadlines: [],
    reviewHistory: [],
    unresolvedOrganizerIssues: 0,
  };
}

describe("Studio 2 country cockpit exact-edition boundary", () => {
  it("requests only the selected Organizer edition", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const client = {
      rpc: async (_name: string, args?: Record<string, unknown>) => {
        capturedArgs = args;
        return { data: [cockpitRow("edition-22")], error: null };
      },
    };

    const rows = await loadStudio2CountryCockpit(" edition-22 ", client);

    expect(capturedArgs).toEqual({ p_edition_id: "edition-22" });
    expect(rows[0]?.context.editionId).toBe("edition-22");
  });

  it("rejects a cockpit payload containing another edition", async () => {
    const client = {
      rpc: async () => ({ data: [cockpitRow("edition-21")], error: null }),
    };

    await expect(loadStudio2CountryCockpit("edition-22", client)).rejects.toThrow(
      "Country cockpit returned data outside the selected edition scope.",
    );
  });

  it("fails before the RPC when no Organizer edition is selected", async () => {
    let called = false;
    const client = {
      rpc: async () => {
        called = true;
        return { data: [], error: null };
      },
    };

    await expect(loadStudio2CountryCockpit("  ", client)).rejects.toThrow(
      "Country cockpit requires an explicit edition scope.",
    );
    expect(called).toBe(false);
  });
});
