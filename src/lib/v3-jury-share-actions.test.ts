import { describe, expect, it, vi } from "vitest";
import type { JuryShareProjection } from "./v3-jury-share-card-foundation";
import {
  buildJuryShareFilename,
  canNativeShareJuryFile,
  copyJuryShareText,
  shareJuryCardFile,
} from "./v3-jury-share-actions";

const projection: JuryShareProjection = {
  schemaVersion: 1,
  ballotId: "ballot-1",
  edition: {
    id: "edition-22",
    slug: "ssc-22",
    number: 22,
    name: "Solaris Song Contest 22",
    historicalIdentityVersion: "edition-v1",
  },
  show: { id: "final", name: "Grand Final", type: "final" },
  source: {
    delegationId: "delegation-oland",
    countryId: "oland",
    displayName: "Øland",
    flagAsset: { id: "flag-oland", url: "/oland.png", alt: "Øland flag" },
    identityVersion: "oland-v1",
  },
  votes: [],
  result: { resultVersionId: "result-v5", publishedAt: "2026-10-23T18:00:00Z" },
  publication: { shareable: true, reason: null },
  stateVersion: "state-v1",
  serverTime: "2026-10-23T18:01:00Z",
};

describe("V3 Jury Share client actions", () => {
  it("uses Web Share only when the browser confirms file sharing", async () => {
    const file = new File(["png"], "votes.png", { type: "image/png" });
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);

    expect(canNativeShareJuryFile(file, { share, canShare })).toBe(true);
    await expect(shareJuryCardFile(file, { navigatorLike: { share, canShare } })).resolves.toBe(
      "shared",
    );
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({ files: [file], title: "Solaris jury votes" });
  });

  it("fails over to download instead of pretending generic share supports files", async () => {
    const file = new File(["png"], "votes.png", { type: "image/png" });
    const share = vi.fn().mockResolvedValue(undefined);

    expect(canNativeShareJuryFile(file, { share })).toBe(false);
    await expect(shareJuryCardFile(file, { navigatorLike: { share } })).resolves.toBe(
      "download_fallback",
    );
    expect(share).not.toHaveBeenCalled();
  });

  it("creates a deterministic safe filename without losing the requested format", () => {
    expect(buildJuryShareFilename(projection, "png")).toBe(
      "solaris-ssc-22-grand-final-land-jury-votes.png",
    );
    expect(buildJuryShareFilename(projection, "jpeg")).toBe(
      "solaris-ssc-22-grand-final-land-jury-votes.jpg",
    );
  });

  it("uses the browser clipboard only when a text-write contract exists", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyJuryShareText("12 · Vendia", { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("12 · Vendia");
    await expect(copyJuryShareText("12 · Vendia", undefined)).resolves.toBe(false);
  });
});
