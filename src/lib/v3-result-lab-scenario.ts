import type {
  ResultLabBlendMode,
  ResultLabJuryScheme,
  ResultLabTieBreak,
} from "./result-lab";

export type V3ResultLabScenario = {
  showId: string | null;
  juryWeight: number;
  blendMode: ResultLabBlendMode;
  juryScheme: ResultLabJuryScheme;
  tieBreak: ResultLabTieBreak;
  excludedVoters: ReadonlySet<string>;
};

export const V3_RESULT_LAB_DEFAULT_SCENARIO: V3ResultLabScenario = Object.freeze({
  showId: null,
  juryWeight: 50,
  blendMode: "raw",
  juryScheme: "original",
  tieBreak: "televote",
  excludedVoters: new Set<string>(),
});

const BLEND_MODES = new Set<ResultLabBlendMode>(["raw", "normalized", "rank"]);
const JURY_SCHEMES = new Set<ResultLabJuryScheme>([
  "original",
  "classic",
  "linear10",
  "top5",
  "winner",
]);
const TIE_BREAKS = new Set<ResultLabTieBreak>([
  "televote",
  "jury",
  "official",
  "alphabetical",
]);

function boundedText(value: string | null, maxLength: number): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function juryWeight(value: string | null): number {
  if (value == null || !value.trim()) return 50;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.min(100, Math.round(parsed / 5) * 5));
}

function enumValue<T extends string>(
  value: string | null,
  allowed: ReadonlySet<T>,
  fallback: T,
): T {
  return value && allowed.has(value as T) ? (value as T) : fallback;
}

function excludedVoters(value: string | null): ReadonlySet<string> {
  if (!value) return new Set();
  const keys = value
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0 && key.length <= 128)
    .slice(0, 50);
  return new Set(keys);
}

/**
 * Parses only hypothetical Result Lab controls. These values never authorize a
 * show or disclose result data; the server source still revalidates show and
 * publication eligibility before returning official inputs.
 */
export function parseV3ResultLabScenario(search: string): V3ResultLabScenario {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    showId: boundedText(params.get("show"), 128),
    juryWeight: juryWeight(params.get("jw")),
    blendMode: enumValue(params.get("blend"), BLEND_MODES, "raw"),
    juryScheme: enumValue(params.get("jury"), JURY_SCHEMES, "original"),
    tieBreak: enumValue(params.get("tie"), TIE_BREAKS, "televote"),
    excludedVoters: excludedVoters(params.get("exclude")),
  };
}

export function serializeV3ResultLabScenario(
  scenario: V3ResultLabScenario,
): string {
  const params = new URLSearchParams();
  const showId = boundedText(scenario.showId, 128);
  if (showId) params.set("show", showId);

  const weight = Math.max(0, Math.min(100, Math.round(scenario.juryWeight / 5) * 5));
  if (weight !== 50) params.set("jw", String(weight));
  if (scenario.blendMode !== "raw" && BLEND_MODES.has(scenario.blendMode)) {
    params.set("blend", scenario.blendMode);
  }
  if (scenario.juryScheme !== "original" && JURY_SCHEMES.has(scenario.juryScheme)) {
    params.set("jury", scenario.juryScheme);
  }
  if (scenario.tieBreak !== "televote" && TIE_BREAKS.has(scenario.tieBreak)) {
    params.set("tie", scenario.tieBreak);
  }

  const excluded = [...scenario.excludedVoters]
    .map((key) => key.trim())
    .filter((key) => key.length > 0 && key.length <= 128)
    .slice(0, 50)
    .sort();
  if (excluded.length) params.set("exclude", excluded.join(","));

  const query = params.toString();
  return query ? `?${query}` : "";
}
