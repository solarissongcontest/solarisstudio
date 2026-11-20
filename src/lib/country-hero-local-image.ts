/**
 * Browser-local Hero Studio preview guard. This is intentionally NOT a
 * publication validator; real upload needs independent server-side checks.
 * Only the first twelve bytes are inspected. No network or media writer.
 */
export type LocalHeroImageFormat = "image/jpeg" | "image/png" | "image/webp";

export function sniffLocalHeroImageFormat(bytes: Uint8Array): LocalHeroImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((byte, index) => bytes[index] === byte))
    return "image/png";
  if (bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
    return "image/webp";
  return null;
}

export function localHeroPreviewFileError(
  file: Pick<File, "type" | "size">,
  detected: LocalHeroImageFormat | null,
): string | null {
  if (!detected || (file.type && file.type !== detected))
    return "The file is not a valid JPEG, PNG or WebP image.";
  if (file.size <= 0 || file.size > 5 * 1024 * 1024)
    return "Choose an image between 1 byte and 5 MB.";
  return null;
}

export function localHeroPreviewDimensionsError(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16)
    return "The image is too small or could not be decoded.";
  return null;
}

export function localHeroPreviewNeedsHighResolutionWarning(width: number, height: number): boolean {
  return width < 1920 || height < 1080;
}

/** Keep object URLs confined to the browser; never persist preview assets. */
export function readLocalHeroImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("The image could not be decoded."));
    img.src = url;
  });
}
