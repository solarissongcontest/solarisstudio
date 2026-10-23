import type {
  JuryShareFormat,
  JuryShareOutputTarget,
  JuryShareProjection,
  JuryShareThemeId,
} from "./v3-jury-share-card-foundation";

export type JuryShareExportRequest = {
  themeId: JuryShareThemeId;
  outputTarget: JuryShareOutputTarget;
  format: JuryShareFormat;
};

export type JuryShareNativeResult = "shared" | "download_fallback" | "cancelled";

type FileShareNavigator = Pick<Navigator, "share" | "canShare">;

export function canNativeShareJuryFile(
  file: File,
  navigatorLike: Partial<FileShareNavigator> = typeof navigator === "undefined" ? {} : navigator,
): boolean {
  if (typeof navigatorLike.share !== "function" || typeof navigatorLike.canShare !== "function") {
    return false;
  }

  try {
    return navigatorLike.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareJuryCardFile(
  file: File,
  options: {
    title?: string;
    navigatorLike?: Partial<FileShareNavigator>;
  } = {},
): Promise<JuryShareNativeResult> {
  const navigatorLike =
    options.navigatorLike ?? (typeof navigator === "undefined" ? {} : navigator);

  if (!canNativeShareJuryFile(file, navigatorLike)) return "download_fallback";

  try {
    await navigatorLike.share?.({
      files: [file],
      title: options.title ?? "Solaris jury votes",
    });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}

export function buildJuryShareFilename(
  projection: JuryShareProjection,
  format: JuryShareFormat,
): string {
  const slug = [
    "solaris",
    projection.edition.slug,
    projection.show.name,
    projection.source.shortDisplayName ?? projection.source.displayName,
    "jury-votes",
  ]
    .join("-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .toLowerCase();

  return `${slug || "solaris-jury-votes"}.${format === "jpeg" ? "jpg" : "png"}`;
}

export function downloadJuryShareFile(file: File, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("File download is unavailable in this environment");
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyJuryShareText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined =
    typeof navigator === "undefined" ? undefined : navigator.clipboard,
): Promise<boolean> {
  if (!clipboard?.writeText) return false;
  await clipboard.writeText(text);
  return true;
}
