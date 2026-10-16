import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const mediaRoute = readFileSync("src/routes/_authenticated/admin/media-assets.tsx", "utf8");

describe("V3 Organizer Media Review preview integration", () => {
  it("renders the canonical source through the embedded preview component", () => {
    expect(mediaRoute).toContain("MediaAssetPreview");
    expect(mediaRoute).toContain(
      "<MediaAssetPreview assetType={asset.assetType} sourceUrl={asset.sourceUrl} title={asset.title} />",
    );
  });

  it("keeps the canonical source link as a fallback and evidence path", () => {
    expect(mediaRoute).toContain("Open source");
    expect(mediaRoute).toContain('target="_blank"');
    expect(mediaRoute).toContain('rel="noreferrer"');
  });
});
