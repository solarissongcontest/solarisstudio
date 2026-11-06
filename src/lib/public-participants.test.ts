import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(() => { throw new Error("Pure participant payload tests must not contact Supabase"); }),
  },
}));

import { parsePublicParticipantPayload } from "./public-participants";

describe("publication-safe participant response handling", () => {
  it("accepts an actual empty published lineup without inventing rows", () => {
    expect(parsePublicParticipantPayload([])).toEqual([]);
  });

  it("treats a malformed or missing RPC response as unavailable, never as zero countries", () => {
    for (const payload of [null, undefined, {}, "", 0, { data: [] }, [null], [42], [{}]]) {
      expect(() => parsePublicParticipantPayload(payload))
        .toThrow("Invalid public participants projection");
    }
  });

  it("retains published participant status and maps an edition-only entity to its public ID", () => {
    const row = {
      id: "participant-1",
      edition_id: "edition-1",
      country_id: null,
      contest_entity_id: "edition-only-delegation-1",
      participation_status: "withdrawn",
      artist: null,
      song: null,
    };
    expect(parsePublicParticipantPayload([row])).toEqual([{
      ...row,
      country_id: "edition-only-delegation-1",
    }]);
  });

  it("retains the ordinary country ID when both canonical IDs are available", () => {
    const row = {
      id: "participant-2",
      edition_id: "edition-2",
      country_id: "country-2",
      contest_entity_id: "alternate-entity-2",
      participation_status: "confirmed",
    };
    expect(parsePublicParticipantPayload([row])[0]?.country_id).toBe("country-2");
  });
});
