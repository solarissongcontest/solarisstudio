import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  localHeroPreviewDimensionsError,
  localHeroPreviewFileError,
  localHeroPreviewNeedsHighResolutionWarning,
  sniffLocalHeroImageFormat,
} from "./country-hero-local-image";

const preview = readFileSync("src/components/mysolaris/CountryHeroStudioPreview.tsx", "utf8");

describe("Country Hero Studio browser-local image validation", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  const webp = new TextEncoder().encode("RIFFabcdWEBP");

  it("sniffs actual file signatures instead of trusting the extension or MIME field", () => {
    expect(sniffLocalHeroImageFormat(png)).toBe("image/png");
    expect(sniffLocalHeroImageFormat(jpeg)).toBe("image/jpeg");
    expect(sniffLocalHeroImageFormat(webp)).toBe("image/webp");
    expect(sniffLocalHeroImageFormat(new TextEncoder().encode("<svg onload="))).toBeNull();
    expect(sniffLocalHeroImageFormat(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffLocalHeroImageFormat(new Uint8Array([]))).toBeNull();
  });

  it("rejects mismatched MIME declarations and oversize private previews", () => {
    expect(localHeroPreviewFileError({ type: "image/png", size: 1024 }, "image/jpeg"))
      .toMatch(/not a valid JPEG/);
    expect(localHeroPreviewFileError({ type: "image/png", size: 1024 }, null))
      .toMatch(/not a valid JPEG/);
    expect(localHeroPreviewFileError({ type: "image/png", size: 0 }, "image/png"))
      .toContain("5 MB");
    expect(localHeroPreviewFileError({ type: "image/png", size: 5 * 1024 * 1024 + 1 }, "image/png"))
      .toContain("5 MB");
    expect(localHeroPreviewFileError({ type: "image/png", size: 5 * 1024 * 1024 }, "image/png"))
      .toBeNull();
  });

  it("rejects undecodable dimensions and warns about desktop-resolution risks", () => {
    expect(localHeroPreviewDimensionsError(0, 0)).not.toBeNull();
    expect(localHeroPreviewDimensionsError(Number.NaN, 1024)).not.toBeNull();
    expect(localHeroPreviewDimensionsError(1500, 900)).toBeNull();
    expect(localHeroPreviewNeedsHighResolutionWarning(1200, 900)).toBe(true);
    expect(localHeroPreviewNeedsHighResolutionWarning(1920, 1080)).toBe(false);
  });

  it("releases an in-flight image URL immediately on replacement, cancellation, unmount and country change", () => {
    expect(preview).toContain("const pendingDecodeUrlRef = useRef<string | null>(null)");
    expect(preview).toContain("const cancelPendingDecode = useCallback(() => {");
    expect(preview).toContain("const pending = pendingDecodeUrlRef.current");
    expect(preview).toContain("if (pending) URL.revokeObjectURL(pending)");
    expect(preview).toContain("pendingDecodeUrlRef.current = blobUrl");
    expect(preview).toContain("useEffect(() => () => { cancelPendingDecode(); }, [cancelPendingDecode])");
    expect(preview).toContain("}, [code, cancelPendingDecode]);");
    expect(preview).toContain("onClick={() => { cancelPendingDecode();");
    expect(preview).toContain("if (pendingDecodeUrlRef.current === blobUrl) pendingDecodeUrlRef.current = null");
  });

  it("revokes stale local URLs and never publishes them or uploads to the backend", () => {
    expect(preview).toContain("generation !== selectionRef.current");
    expect(preview).toContain("selectionRef.current += 1");
    expect(preview).toContain("URL.revokeObjectURL(blobUrl)");
    expect(preview).toContain("URL.revokeObjectURL(url)");
    expect(preview).toContain("file.slice(0, 12).arrayBuffer()");
    expect(preview).toContain("localPreview?.countryCode === code");
    expect(preview).toContain("selectedCountry !== currentCountryRef.current");
    expect(preview).toContain("setLocalPreview(null)");
    expect(preview).toContain("countryCode: selectedCountry");
    expect(preview).toContain("aria-busy={checkingPreview}");
    expect(preview).toContain("Cancel image check");
    expect(preview).toContain("setCheckingPreview(false)");
    expect(preview).toContain('role="status"');
    expect(preview).not.toContain("supabase.");
    expect(preview).not.toContain("uploadVerifiedFile");
  });
});
