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

  it("keeps only a sanitized HTTP(S) source action as the fallback evidence path", () => {
    expect(mediaRoute).toContain("safeMediaAssetSourceUrl");
    expect(mediaRoute).toContain("const safeSourceUrl = safeMediaAssetSourceUrl(asset?.sourceUrl)");
    expect(mediaRoute).toContain("{safeSourceUrl ? <a href={safeSourceUrl}");
    expect(mediaRoute).not.toContain("<a href={asset.sourceUrl}");
    expect(mediaRoute).toContain('target="_blank"');
    expect(mediaRoute).toContain('rel="noreferrer"');
  });
});
