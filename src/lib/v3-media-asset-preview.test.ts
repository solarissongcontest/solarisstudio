import { describe, expect, it } from "vitest";

import {
  mediaAssetPreviewKind,
  safeMediaAssetSourceUrl,
} from "@/components/admin/MediaAssetPreview";

describe("V3 Media Review embedded preview selection", () => {
  it("embeds ordinary image classes without requiring a download", () => {
    for (const type of [
      "logo",
      "flag",
      "artist_photo",
      "cover_artwork",
      "postcard",
      "press_image",
      "broadcast_graphic",
    ] as const) {
      expect(mediaAssetPreviewKind(type, "https://cdn.example.com/asset.webp")).toBe("image");
    }
  });

  it("embeds direct audio and video files", () => {
    expect(mediaAssetPreviewKind("audio_master", "https://cdn.example.com/master.flac")).toBe("audio");
    expect(mediaAssetPreviewKind("performance_video", "https://cdn.example.com/final.mp4")).toBe("video");
  });

  it("falls back for page URLs whose media stream cannot be inferred safely", () => {
    expect(mediaAssetPreviewKind("performance_video", "https://www.youtube.com/watch?v=abc")).toBe(
      "fallback",
    );
    expect(mediaAssetPreviewKind("audio_master", "https://example.com/listen/track")).toBe("fallback");
  });

  it("never embeds or links non-http sources", () => {
    for (const value of ["javascript:alert(1)", "file:///tmp/video.mp4", "data:text/html,hello"]) {
      expect(safeMediaAssetSourceUrl(value)).toBeNull();
    }
    expect(mediaAssetPreviewKind("artist_photo", "javascript:alert(1)")).toBe("fallback");
    expect(mediaAssetPreviewKind("performance_video", "file:///tmp/video.mp4")).toBe("fallback");
  });

  it("normalizes valid HTTP(S) source URLs before rendering them", () => {
    expect(safeMediaAssetSourceUrl("  https://cdn.example.com/final.mp4  ")).toBe(
      "https://cdn.example.com/final.mp4",
    );
    expect(safeMediaAssetSourceUrl("http://cdn.example.com/image.jpg")).toBe(
      "http://cdn.example.com/image.jpg",
    );
  });
});
