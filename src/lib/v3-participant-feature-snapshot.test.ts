import { describe, expect, it } from "vitest";

import {
  resolveV3ParticipantFeatureSnapshot,
  V3_PARTICIPANT_FEATURE_KEYS,
} from "@/lib/v3-participant-feature-snapshot";

describe("V3 participant feature snapshot", () => {
  it("returns only explicitly enabled participant capabilities", () => {
    expect(
      resolveV3ParticipantFeatureSnapshot([
        { flag_key: "official_communications", enabled: true },
        { flag_key: "hod_workspace_v2", enabled: false },
        { flag_key: "rules_engine", enabled: true },
      ]),
    ).toEqual(["official_communications", "rules_engine"]);
  });

  it("accepts a complete all-disabled snapshot", () => {
    expect(
      resolveV3ParticipantFeatureSnapshot(
        V3_PARTICIPANT_FEATURE_KEYS.map((flag_key) => ({ flag_key, enabled: false })),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      "missing rows",
      [
        { flag_key: "official_communications", enabled: true },
        { flag_key: "rules_engine", enabled: false },
      ],
    ],
    [
      "duplicate rows",
      [
        { flag_key: "official_communications", enabled: true },
        { flag_key: "official_communications", enabled: true },
        { flag_key: "hod_workspace_v2", enabled: false },
        { flag_key: "rules_engine", enabled: false },
      ],
    ],
    [
      "unexpected keys",
      [
        { flag_key: "official_communications", enabled: true },
        { flag_key: "hod_workspace_v2", enabled: false },
        { flag_key: "rules_engine", enabled: false },
        { flag_key: "organizer_superpowers", enabled: true },
      ],
    ],
    [
      "malformed values",
      [
        { flag_key: "official_communications", enabled: true },
        { flag_key: "hod_workspace_v2", enabled: "yes" },
        { flag_key: "rules_engine", enabled: false },
      ],
    ],
  ])("fails closed on %s", (_label, rows) => {
    expect(resolveV3ParticipantFeatureSnapshot(rows)).toBeNull();
  });

  it("fails closed when the RPC payload is not an array", () => {
    expect(resolveV3ParticipantFeatureSnapshot(null)).toBeNull();
    expect(resolveV3ParticipantFeatureSnapshot({})).toBeNull();
  });
});
