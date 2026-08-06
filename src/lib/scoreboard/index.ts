import { resolveTheme } from "../theme";
import { defaultScoreboard } from "./presets";
import { migrateScoreboard } from "./resolve";
import type { ScoreboardConfig } from "./types";

export * from "./types";
export * from "./resolve";
export * from "./presets";

/**
 * Reads the scoreboard configuration out of a show's `broadcast_config`.
 * Shows saved before the board engine existed fall back to the default preset.
 */
export function resolveScoreboard(raw: unknown): ScoreboardConfig {
  const source =
    raw && typeof raw === "object" && "scoreboard" in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).scoreboard
      : raw;
  return migrateScoreboard(source, defaultScoreboard());
}

/** Convenience for previews that need a theme without a show attached. */
export const previewTheme = () => resolveTheme(undefined);
