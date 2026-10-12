import { describe, expect, it } from "vitest";

import type { V3ExperienceProjection } from "./v3-domain-state";
import type { V3AttentionProjection } from "./v3-experience";
import { projectV3Home, V3_HOME_SECTION_ORDER } from "./v3-home";

const clearAttention: V3AttentionProjection = {
  primary: null,
  secondary: [],
  remainingCount: 0,
  badgeCount: 0,
  immediateCount: 0,
  hasBlockingAction: false,
};

function experience(
  mode: V3ExperienceProjection["mode"],
  overrides: Partial<V3ExperienceProjection> = {},
): V3ExperienceProjection {
  return {
    mode,
    live: mode === "live" || mode === "live-voting",
    votingOpen: mode === "voting" || mode === "live-voting",
    resultsPublic: mode === "results",
    ...overrides,
  };
}

describe("V3 Home projection", () => {
  it("keeps the Home spatial skeleton stable across states", () => {
    for (const mode of ["active", "show-day", "live", "voting", "results"] as const) {
      expect(
        projectV3Home({ experience: experience(mode), attention: clearAttention }).sectionOrder,
      ).toBe(V3_HOME_SECTION_ORDER);
    }
  });

  it("lets required personal attention own the Now slot even during a live show", () => {
    const attention: V3AttentionProjection = {
      ...clearAttention,
      primary: {
        id: "jury:sf1",
        editionId: "22",
        kind: "jury",
        sourceState: "needs_attention",
        title: "Jury voting",
        description: "Finish your ballot.",
        why: "Official jury work remains incomplete.",
        route: "/jury-voting",
        actionRequired: true,
        urgency: "high",
        impact: "blocking",
        deliveryClass: "required",
        opensAt: null,
        deadline: null,
        completed: false,
      },
      badgeCount: 1,
      hasBlockingAction: true,
    };

    const home = projectV3Home({
      experience: experience("live-voting"),
      attention,
    });

    expect(home.primaryMode).toBe("attention");
    expect(home.attention.primary?.id).toBe("jury:sf1");
  });

  it("shows event states in Now when no personal action outranks them", () => {
    expect(projectV3Home({ experience: experience("show-day"), attention: clearAttention }).primaryMode).toBe("show-day");
    expect(projectV3Home({ experience: experience("live"), attention: clearAttention }).primaryMode).toBe("live");
    expect(projectV3Home({ experience: experience("live-voting"), attention: clearAttention }).primaryMode).toBe("live-voting");
    expect(projectV3Home({ experience: experience("voting"), attention: clearAttention }).primaryMode).toBe("voting");
  });

  it("never leaks published result content through Home when spoiler protection is active", () => {
    const visible = projectV3Home({
      experience: experience("results"),
      attention: clearAttention,
      hideResultSpoilers: false,
    });
    const hidden = projectV3Home({
      experience: experience("results"),
      attention: clearAttention,
      hideResultSpoilers: true,
    });

    expect(visible.primaryMode).toBe("results");
    expect(visible.showResults).toBe(true);
    expect(hidden.primaryMode).toBe("results-hidden");
    expect(hidden.showResults).toBe(false);
  });

  it("keeps calm active editions quiet instead of manufacturing a greeting-only alert", () => {
    expect(
      projectV3Home({ experience: experience("active"), attention: clearAttention }).primaryMode,
    ).toBe("calm");
  });
});
