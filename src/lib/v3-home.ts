import type { V3ExperienceProjection } from "./v3-domain-state";
import type { V3AttentionProjection } from "./v3-experience";

export const V3_HOME_SECTION_ORDER = [
  "now",
  "current-contest",
  "coming-up",
  "latest",
] as const;

export type V3HomePrimaryMode =
  | "attention"
  | "calm"
  | "show-day"
  | "live"
  | "live-voting"
  | "voting"
  | "results"
  | "results-hidden"
  | "post-edition"
  | "planning"
  | "cancelled";

export type V3HomeProjection = {
  sectionOrder: typeof V3_HOME_SECTION_ORDER;
  primaryMode: V3HomePrimaryMode;
  attention: V3AttentionProjection;
  showResults: boolean;
};

export type V3HomeProjectionInput = {
  experience: V3ExperienceProjection;
  attention: V3AttentionProjection;
  hideResultSpoilers?: boolean;
};

/**
 * Home keeps one stable spatial skeleton. Only emphasis changes.
 *
 * Required personal attention wins the Now slot even during event states. Live,
 * voting and results still remain visible in Current Contest; they simply do
 * not displace work Solaris already knows the user must complete.
 */
export function projectV3Home({
  experience,
  attention,
  hideResultSpoilers = false,
}: V3HomeProjectionInput): V3HomeProjection {
  let primaryMode: V3HomePrimaryMode;

  if (attention.primary) primaryMode = "attention";
  else {
    switch (experience.mode) {
      case "show-day":
        primaryMode = "show-day";
        break;
      case "live":
        primaryMode = "live";
        break;
      case "live-voting":
        primaryMode = "live-voting";
        break;
      case "voting":
        primaryMode = "voting";
        break;
      case "results":
        primaryMode = hideResultSpoilers ? "results-hidden" : "results";
        break;
      case "post-edition":
      case "archived":
        primaryMode = "post-edition";
        break;
      case "planning":
        primaryMode = "planning";
        break;
      case "cancelled":
        primaryMode = "cancelled";
        break;
      case "active":
        primaryMode = "calm";
        break;
    }
  }

  return {
    sectionOrder: V3_HOME_SECTION_ORDER,
    primaryMode,
    attention,
    showResults: experience.resultsPublic && !hideResultSpoilers,
  };
}
