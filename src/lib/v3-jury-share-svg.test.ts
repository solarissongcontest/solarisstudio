import { describe, expect, it } from "vitest";
import {
  JURY_SHARE_POINTS,
  type JuryShareProjection,
  type JuryShareVote,
} from "./v3-jury-share-card-foundation";
import {
  buildJuryShareAltDescription,
  juryShareThemeVersion,
  renderJuryShareSvg,
  JuryShareSvgError,
  type EditionJuryShareVisuals,
} from "./v3-jury-share-svg";

// Inline a tiny raster for deterministic, offline-only tests. No hosted
// Supabase, remote flag service or browser automation is contacted.
const PNG = "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9nhnUAAAAASUVORK5CYII=";

const votes: JuryShareVote[] = JURY_SHARE_POINTS.map((points, index) => ({
  recipientCountryId: "country-" + index,
  displayName: index === 1 ? "Hanvør" : index === 2 ? "Ækâlin" : "Country " + index,
  flagAsset: { id: "flag-" + index, url: "/flags/" + index + ".png", alt: "Flag" },
  identityVersion: "historical-" + index,
  points,
  rank: index + 1,
}));

function projection(overrides: Partial<JuryShareProjection> = {}): JuryShareProjection {
  return {
    schemaVersion: 1,
    ballotId: "never-include-this-ballot-id",
    edition: {
      id: "edition-22",
      slug: "ssc22",
      number: 22,
      name: "Solaris Song Contest 22",
      historicalIdentityVersion: "edition-v1",
    },
    show: { id: "final", name: "Grand Final", type: "final" },
    source: {
      delegationId: "private-delegation-id",
      countryId: "oland",
      displayName: "Oland",
      flagAsset: { id: "source-flag", url: "/flags/source.png", alt: "Oland flag" },
      identityVersion: "oland-v1",
    },
    votes,
    result: { resultVersionId: "result-5", publishedAt: "2026-10-18T20:00:00Z" },
    publication: { shareable: true, reason: null },
    stateVersion: "current",
    serverTime: "2026-10-18T21:00:00Z",
    ...overrides,
  };
}

const assets = Object.fromEntries([
  ["source-flag", PNG],
  ...votes.map((vote) => [vote.flagAsset.id, PNG]),
]);

const editionTheme: EditionJuryShareVisuals = {
  editionId: "edition-22",
  version: 3,
  colors: {
    background: "#18142B",
    row: "#335077",
    rowText: "#FFFFFF",
    twelveRow: "#EDD99F",
    twelveText: "#18142B",
    accent: "#B8B1FF",
  },
};

describe("V3 Jury Share deterministic SVG renderer", () => {
  it("renders the canonical 1080×1920 story and all ten padded score rows", () => {
    const svg = renderJuryShareSvg(projection(), { assets });
    expect(svg).toContain('width="1080" height="1920"');
    expect(svg).toContain('viewBox="0 0 1080 1920"');
    expect(svg.match(/data-jury-row="/g)).toHaveLength(10);
    expect(svg.match(/<image /g)).toHaveLength(11);
    expect(svg).toContain('data-jury-row="12"');
    expect(svg).toContain('rx="28"');
    expect(svg).toContain('data-jury-row="1"');
    expect(svg).toContain(">08</text>");
    expect(svg).toContain(">01</text>");
    expect(svg).toContain("VOTES OF:");
    expect(svg).toContain(">Oland</text>");
    expect(svg).toContain("Hanvør");
    expect(svg).toContain("Ækâlin");
    expect(svg).toContain('aria-labelledby="jury-share-title jury-share-desc"');
    expect(svg).not.toContain("never-include-this-ballot-id");
    expect(svg).not.toContain("private-delegation-id");
    expect(svg).not.toContain("result-5");
  });

  it("rejects unpublished or non-shareable material before touching assets", () => {
    expect(() => renderJuryShareSvg(
      projection({ publication: { shareable: false, reason: "JURY_BREAKDOWN_PRIVATE" } }),
      { assets: {} },
    )).toThrow(/JURY_BREAKDOWN_PRIVATE/);
  });

  it("rejects remote, SVG, malformed and missing flag assets", () => {
    const badAssets = { ...assets, "flag-0": "https://example.com/flag.png" };
    expect(() => renderJuryShareSvg(projection(), { assets: badAssets })).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ASSET" }),
    );
    const svgAsset = { ...assets, "flag-0": "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" };
    expect(() => renderJuryShareSvg(projection(), { assets: svgAsset })).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ASSET" }),
    );
    const missing = { ...assets };
    delete missing["flag-0"];
    expect(() => renderJuryShareSvg(projection(), { assets: missing })).toThrowError(
      expect.objectContaining({ code: "ASSET_UNAVAILABLE" }),
    );
  });

  it("escapes dynamic XML rather than interpreting name markup", () => {
    const svg = renderJuryShareSvg(
      projection({
        source: {
          ...projection().source,
          displayName: 'Oland <script>alert("x")</script>',
        },
      }),
      { assets },
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&quot;x&quot;");
  });

  it("does not truncate historical names and rejects unrenderable long text", () => {
    expect(buildJuryShareAltDescription(projection())).toContain("10 points to Hanvør");
    const unfit = votes.map((vote, index) => index === 0
      ? { ...vote, displayName: "A".repeat(250) } : vote);
    expect(() => renderJuryShareSvg(projection({ votes: unfit }), { assets }))
      .toThrowError(expect.objectContaining({ code: "TEXT_OVERFLOW" }));
  });

  it("keeps Default independent of Edition and offers separate Liquid Glass styling", () => {
    const standard = renderJuryShareSvg(projection(), { assets });
    const liquid = renderJuryShareSvg(projection(), { assets, theme: "liquid_glass" });
    expect(standard).toContain("#2B63A6");
    expect(liquid).toContain('fill="url(#glass)"');
    expect(standard).not.toContain('fill="url(#glass)"');
    expect(juryShareThemeVersion("default")).toBe(1);
    expect(juryShareThemeVersion("liquid_glass")).toBe(1);
  });

  it("requires valid historically matched Edition tokens without affecting Default", () => {
    expect(() => renderJuryShareSvg(projection(), { assets, theme: "edition" }))
      .toThrowError(expect.objectContaining({ code: "THEME_UNAVAILABLE" }));
    const rendered = renderJuryShareSvg(projection(), {
      assets,
      theme: "edition",
      editionTheme,
    });
    expect(rendered).toContain("#18142B");
    expect(rendered).toContain("#B8B1FF");
    expect(juryShareThemeVersion("edition", editionTheme)).toBe(3);
    expect(() => renderJuryShareSvg(projection(), {
      assets,
      theme: "edition",
      editionTheme: { ...editionTheme, editionId: "other-edition" },
    })).toThrowError(expect.objectContaining({ code: "INVALID_THEME" }));
    expect(() => renderJuryShareSvg(projection(), {
      assets,
      theme: "edition",
      editionTheme: {
        ...editionTheme,
        colors: { ...editionTheme.colors, row: "url(javascript:alert(1))" },
      },
    })).toThrowError(expect.objectContaining({ code: "INVALID_THEME" }));
    expect(() => renderJuryShareSvg(projection(), {
      assets,
      theme: "edition",
      editionTheme: { ...editionTheme, artworkOpacity: 4 },
    })).toThrowError(expect.objectContaining({ code: "INVALID_THEME" }));
  });

  it("rejects incomplete historical palettes and invalid render-key theme identities", () => {
    const incomplete = {
      ...editionTheme,
      colors: {
        ...editionTheme.colors,
        rowText: undefined,
      } as unknown as EditionJuryShareVisuals["colors"],
    };
    expect(() => renderJuryShareSvg(projection(), {
      assets,
      theme: "edition",
      editionTheme: incomplete,
    })).toThrowError(expect.objectContaining({ code: "INVALID_THEME" }));
    expect(() => renderJuryShareSvg(projection(), {
      assets,
      theme: "edition",
      editionTheme: {
        ...editionTheme,
        colors: null as unknown as EditionJuryShareVisuals["colors"],
      },
    })).toThrowError(expect.objectContaining({ code: "INVALID_THEME" }));
    expect(() => juryShareThemeVersion(
      "future-theme" as Parameters<typeof juryShareThemeVersion>[0],
    )).toThrowError(expect.objectContaining({ code: "THEME_UNAVAILABLE" }));
  });

  it("bounds all meaningful vertical positions to the shared Story safe area", () => {
    // Header starts below top 192, footer ends before 1920 - 240 = 1680.
    const svg = renderJuryShareSvg(projection(), { assets });
    expect(svg).toContain('y="222"');
    expect(svg).toContain('y="1644"');
    expect(svg).toContain('height="76"');
    expect(JURY_SHARE_POINTS).toHaveLength(10);
  });

  it("returns a typed error for untrusted asset sources", () => {
    try {
      renderJuryShareSvg(projection(), { assets: { ...assets, "source-flag": "file:///etc/passwd" } });
      throw new Error("Expected unsafe asset error");
    } catch (error) {
      expect(error).toBeInstanceOf(JuryShareSvgError);
      expect((error as JuryShareSvgError).code).toBe("UNSAFE_ASSET");
    }
  });
});
