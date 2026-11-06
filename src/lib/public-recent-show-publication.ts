import { isShowPublic } from "./publication";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Narrow database JSON before applying the canonical Show publication policy. */
export function isRecentShowPublic(show: {
  published: boolean | null;
  publication_config: unknown;
}): boolean {
  const config = show.publication_config;
  if (config !== null && !isRecord(config)) return false;
  return isShowPublic({ published: show.published, publication_config: config });
}
