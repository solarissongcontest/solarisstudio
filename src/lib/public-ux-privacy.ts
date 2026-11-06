const MAX_PATH_LENGTH = 512;
const MAX_TARGET_LENGTH = 120;

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_SECRETISH_SEGMENT = /^[A-Za-z0-9_-]{32,}$/;
const SAFE_STATIC_TARGET = /^[A-Za-z][A-Za-z0-9:_./-]{0,119}$/;

export type PublicUxPrivacyNavigator = {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
};

export function publicUxTelemetryAllowed(
  navigatorLike?: PublicUxPrivacyNavigator | null,
) {
  if (!navigatorLike) return true;
  if (navigatorLike.globalPrivacyControl === true) return false;

  const doNotTrack = navigatorLike.doNotTrack?.trim().toLowerCase();
  return doNotTrack !== "1" && doNotTrack !== "yes";
}

export function sanitizePublicUxPath(value: string) {
  const pathname = extractPathname(value);
  if (!pathname) return "/";

  const segments = pathname
    .split("/")
    .map((segment, index) => (index === 0 ? segment : sanitizePathSegment(segment)));

  const normalized = segments.join("/") || "/";
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.slice(0, MAX_PATH_LENGTH);
}

export function sanitizePublicUxTarget(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (looksLikeRoute(trimmed)) {
    return sanitizePublicUxPath(trimmed);
  }

  if (!SAFE_STATIC_TARGET.test(trimmed)) return null;
  if (UUID_SEGMENT.test(trimmed) || LONG_SECRETISH_SEGMENT.test(trimmed)) return null;

  return trimmed.slice(0, MAX_TARGET_LENGTH);
}

function looksLikeRoute(value: string) {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  );
}

function extractPathname(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "/";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      return new URL(trimmed).pathname || "/";
    } catch {
      return "/";
    }
  }

  const withoutHash = trimmed.split("#", 1)[0] ?? "";
  const withoutQuery = withoutHash.split("?", 1)[0] ?? "";
  if (!withoutQuery) return "/";

  if (withoutQuery.startsWith("./")) return withoutQuery.slice(1);
  if (withoutQuery.startsWith("../")) return "/";
  return withoutQuery;
}

function sanitizePathSegment(segment: string) {
  if (!segment) return segment;

  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the encoded segment. Invalid encoding is still handled by the
    // conservative shape checks below.
  }

  if (UUID_SEGMENT.test(decoded)) return ":id";
  if (LONG_SECRETISH_SEGMENT.test(decoded)) return ":token";
  if (decoded.includes("@")) return ":value";

  return segment;
}
