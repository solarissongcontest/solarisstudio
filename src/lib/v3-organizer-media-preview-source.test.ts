import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { describeOrganizerMediaSource, resolveOrganizerMediaPreviewSource } from "./v3-organizer-media-preview-source";

describe("Organizer Media Review opt-in external preview", () => {
  it("allows direct image previews only for image asset types", () => {
    expect(resolveOrganizerMediaPreviewSource("https://cdn.example.test/artist.JPG", "artist_photo")?.previewKind).toBe("image");
    expect(resolveOrganizerMediaPreviewSource("https://cdn.example.test/flag.webp", "flag")?.previewKind).toBe("image");
    expect(resolveOrganizerMediaPreviewSource("https://cdn.example.test/image.svg", "logo")?.previewKind).toBeNull();
    expect(resolveOrganizerMediaPreviewSource("https://cdn.example.test/image.png", "audio_master")?.previewKind).toBeNull();
  });

  it("recognizes direct audio and video assets without guessing from a web page", () => {
    expect(resolveOrganizerMediaPreviewSource("https://cdn.example.test/song.M4A", "audio_master")?.previewKind).toBe("audio");
    expect(resolveOrganizerMediaPreviewSource("https://cdn.example.test/live.webm", "performance_video")?.previewKind).toBe("video");
    expect(resolveOrganizerMediaPreviewSource("https://video.example.test/watch?v=123", "performance_video")?.previewKind).toBeNull();
  });

  it("preserves signed URL query identity but does not mistake it for a file extension", () => {
    const source = "https://cdn.example.test/private/a.mp4?token=opaque&expires=42";
    expect(resolveOrganizerMediaPreviewSource(source, "performance_video")).toEqual({
      url: source,
      host: "cdn.example.test",
      previewKind: "video",
    });
    expect(resolveOrganizerMediaPreviewSource("https://cdn.example.test/watch?download=picture.jpg", "artist_photo")?.previewKind).toBeNull();
  });

  it("refuses script, data, blob and filesystem URLs", () => {
    for (const value of [
      "javascript:alert(1)", "JaVaScRiPt:alert(1)",
      "data:image/svg+xml,<svg/>", "blob:https://studio.example.test/abc",
      "file:///etc/passwd",
    ]) {
      expect(resolveOrganizerMediaPreviewSource(value, "artist_photo")).toBeNull();
    }
  });

  it("rejects relative, protocol-relative and credential-bearing links", () => {
    for (const url of ["/media/artist.jpg", "//cdn.example.test/artist.jpg", "https://user:pass@cdn.example.test/a.jpg"]) {
      expect(resolveOrganizerMediaPreviewSource(url, "artist_photo")).toBeNull();
    }
  });

  it("treats unknown but safe HTTP(S) destinations as external links, not inline media", () => {
    expect(resolveOrganizerMediaPreviewSource("http://example.test/asset", "postcard")).toEqual({
      url: "http://example.test/asset",
      host: "example.test",
      previewKind: null,
    });
    expect(resolveOrganizerMediaPreviewSource(null, "postcard")).toBeNull();
  });

  it("renders media only behind deliberate interaction, without eager audio or video downloads", () => {
    const route = readFileSync(resolve(process.cwd(), "src/routes/_authenticated/admin/media-assets.tsx"), "utf8");
    expect(route).toContain("resolveOrganizerMediaPreviewSource");
    expect(route).toContain("previewTarget === previewKey");
    expect(route).toContain("Load preview from");
    expect(route).toContain('preload="none"');
    expect(route).toContain('referrerPolicy="no-referrer"');
    expect(route).toContain('rel="noopener noreferrer"');
    expect(route).toContain("setPreviewTarget(null)");
  });
  it("rejects control characters before browser URL normalization", () => {
    for (const url of [
      "https://cdn.example.test/a\n@evil.example/image.jpg",
      "https://cdn.example.test/a\t.jpg",
      "https://cdn.example.test/file.jpg\r",
      "\nhttps://cdn.example.test/file.jpg",
    ]) {
      expect(resolveOrganizerMediaPreviewSource(url, "artist_photo")).toBeNull();
    }
  });

  it("keeps opaque URLs and signed fingerprints out of reviewer-visible labels", () => {
    const signed = "https://cdn.example.test/private/opaque/file.mp3?X-Amz-Signature=SECRET";
    expect(describeOrganizerMediaSource(signed)).toBe("External source · cdn.example.test");
    const route = readFileSync(resolve(process.cwd(), "src/routes/_authenticated/admin/media-assets.tsx"), "utf8");
    expect(route).toContain("describeOrganizerMediaSource(item.sourceUrl)");
    expect(route).toContain("describeOrganizerMediaSource(asset.sourceUrl)");
    expect(route).not.toContain("{item.sourceFingerprint}</p>");
    expect(route).not.toContain("href={asset.sourceUrl}");
    expect(route).not.toContain("{asset.sourceUrl ??");
    expect(route).not.toContain("autoPlay");
  });
});
