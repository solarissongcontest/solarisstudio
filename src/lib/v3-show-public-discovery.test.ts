import { describe, expect, it } from "vitest";

import { DEFAULT_PUBLICATION_CONFIG, RESULTS_PUBLICATION_CONFIG } from "./publication";
import { publicShowsForDiscovery, visibleRecentShowDestinations } from "./v3-show-public-discovery";

type ShowInput = Parameters<typeof publicShowsForDiscovery>[0][number];

const show = (id: string, editionId: string, options: Partial<ShowInput> = {}): ShowInput => ({
  id,
  edition_id: editionId,
  published: true,
  publication_config: RESULTS_PUBLICATION_CONFIG,
  ...options,
});

describe("public personalized Shows discovery", () => {
  const editions = [
    { id: "published-edition", published: true },
    { id: "private-edition", published: false },
  ];

  it("requires both a published edition and public show layers", () => {
    const rows = [
      show("public", "published-edition"),
      show("show-draft", "published-edition", { published: false }),
      show("edition-draft", "private-edition"),
      show("no-public-layers", "published-edition", {
        publication_config: DEFAULT_PUBLICATION_CONFIG,
      }),
      show("orphan", "missing-edition"),
    ];

    expect(publicShowsForDiscovery(rows, editions).map((item) => item.id)).toEqual(["public"]);
  });

  it("preserves legacy published shows only in published editions", () => {
    const rows = [
      show("legacy-visible", "published-edition", { publication_config: null }),
      show("legacy-hidden", "private-edition", { publication_config: null }),
    ];
    expect(publicShowsForDiscovery(rows, editions).map((item) => item.id)).toEqual([
      "legacy-visible",
    ]);
  });

  it("does not expose former shows from cached recent links", () => {
    const recents = [
      { path: "/shows/public", label: "Public final" },
      { path: "/shows/edition-draft", label: "Unpublished final" },
      { path: "/shows/%70ublic?from=explore", label: "Encoded public final" },
      { path: "/shows/%not-encoded", label: "Malformed" },
      { path: "/countries/ol", label: "Oland" },
    ];
    const visible = publicShowsForDiscovery(
      [show("public", "published-edition"), show("edition-draft", "private-edition")],
      editions,
    );
    expect(visibleRecentShowDestinations(recents, visible)).toEqual([
      recents[0],
      recents[2],
      recents[4],
    ]);
  });

  it("fails closed for show recents while public-show data is unavailable", () => {
    const recents = [
      { path: "/shows/public", label: "Public final" },
      { path: "/stories/example", label: "Story" },
    ];
    expect(visibleRecentShowDestinations(recents, [])).toEqual([recents[1]]);
  });
});
