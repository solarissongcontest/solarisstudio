import { describe, expect, it } from "vitest";

import {
  DEFAULT_PUBLICATION_CONFIG,
  RESULTS_PUBLICATION_CONFIG,
  isShowPublic,
  normalisePublicationDependencies,
  resolveAutomaticEditionStatus,
  resolveShowPublication,
} from "./publication";

describe("show publication", () => {
  it("keeps a modern empty publication config private", () => {
    const show = {
      published: true,
      publication_config: { ...DEFAULT_PUBLICATION_CONFIG },
    };

    expect(resolveShowPublication(show)).toEqual(DEFAULT_PUBLICATION_CONFIG);
    expect(isShowPublic(show)).toBe(false);
  });

  it("restores the safe results preset for legacy published shows", () => {
    const show = {
      published: true,
      publication_config: {},
    };

    expect(resolveShowPublication(show)).toEqual(RESULTS_PUBLICATION_CONFIG);
    expect(isShowPublic(show)).toBe(true);
  });

  it("never makes a show public when its route-level flag is false", () => {
    expect(
      isShowPublic({
        published: false,
        publication_config: { ...RESULTS_PUBLICATION_CONFIG },
      }),
    ).toBe(false);
  });

  it("publishes both result totals when detailed voting is enabled", () => {
    const normalised = normalisePublicationDependencies({
      ...DEFAULT_PUBLICATION_CONFIG,
      detailed_voting: true,
    });

    expect(normalised.jury_results).toBe(true);
    expect(normalised.televote_results).toBe(true);
  });
});

describe("automatic edition status", () => {
  it("treats a legacy published grand final with results as completed", () => {
    expect(
      resolveAutomaticEditionStatus([
        {
          kind: "grand-final",
          published: true,
          publication_config: {},
        },
      ]),
    ).toBe("completed");
  });

  it("keeps participant-only publication in the published state", () => {
    expect(
      resolveAutomaticEditionStatus([
        {
          kind: "semi-final",
          published: true,
          publication_config: {
            ...DEFAULT_PUBLICATION_CONFIG,
            participants: true,
          },
        },
      ]),
    ).toBe("published");
  });

  it("keeps editions with no public information as drafts", () => {
    expect(
      resolveAutomaticEditionStatus([
        {
          kind: "grand-final",
          published: false,
          publication_config: { ...RESULTS_PUBLICATION_CONFIG },
        },
      ]),
    ).toBe("draft");
  });
});
