import {
  FRIEND_VOTING_HISTORICAL_MODEL_VERSION,
} from "@/integrations/televoting/advanced-friend-voting";
import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  IntelligenceChannel,
  IntelligencePair,
  IntelligenceSignal,
} from "@/integrations/televoting/intelligence.server";

type HistoricalCountryOptions = {
  channel: IntelligenceChannel;
  editionId?: string | null;
};

type HistoricalCountryRow = {
  voter_code?: unknown;
  target_code?: unknown;
  voting_country_name?: unknown;
  target_country_name?: unknown;
  opportunities?: unknown;
  supported?: unknown;
  maximum_scores?: unknown;
  points?: unknown;
  unique_editions?: unknown;
  jury_opportunities?: unknown;
  jury_supported?: unknown;
  jury_points?: unknown;
  televote_opportunities?: unknown;
  televote_supported?: unknown;
  televote_points?: unknown;
  historical_opportunities?: unknown;
  historical_supported?: unknown;
  historical_maximum?: unknown;
  historical_average_score?: unknown;
  historical_normalized_average?: unknown;
  jury_historical_opportunities?: unknown;
  jury_historical_supported?: unknown;
  jury_editions?: unknown;
  televote_historical_opportunities?: unknown;
  televote_historical_supported?: unknown;
  televote_editions?: unknown;
  support_editions?: unknown;
  maximum_editions?: unknown;
  cross_channel_editions?: unknown;
  outer_normalized_average?: unknown;
  reciprocal_editions?: unknown;
  support_rate?: unknown;
  maximum_rate?: unknown;
  reciprocal_rate?: unknown;
  cross_channel_rate?: unknown;
  risk_score?: unknown;
  confidence?: unknown;
  jury_risk?: unknown;
  televote_risk?: unknown;
  cross_channel_risk?: unknown;
  relationship_anomaly?: unknown;
  reciprocity_risk?: unknown;
  intensity_risk?: unknown;
};

type HistoricalSubmission = {
  countryCode?: unknown;
  username?: unknown;
  usernameNormalized?: unknown;
  isVpn?: unknown;
  riskScore?: unknown;
  status?: unknown;
};

type HistoricalPayload = {
  relationships?: HistoricalCountryRow[];
  stats?: Record<string, unknown>;
  submissions?: HistoricalSubmission[];
  countries?: Record<string, unknown>;
  editions?: Array<{ id?: unknown; name?: unknown; editionNumber?: unknown }>;
};

type CacheEntry = {
  expiresAt: number;
  promise: Promise<HistoricalPayload>;
};

const CACHE_TTL_MS = 30_000;
const payloadCache = new Map<string, CacheEntry>();

const number = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const integer = (value: unknown) => Math.trunc(number(value));
const pctNumber = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 1000) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const code = (value: unknown) => String(value ?? "").trim().toUpperCase();
const text = (value: unknown) => String(value ?? "").trim();

function cachedPayload(options: HistoricalCountryOptions) {
  const cacheKey = `${options.channel}:${options.editionId ?? "all"}`;
  const now = Date.now();
  const cached = payloadCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = (async () => {
    const { data, error } = await (supabaseAdmin.rpc as any)(
      "friend_voting_historical_country_payload",
      {
        p_channel: options.channel,
        p_edition_id: options.editionId ?? null,
        p_limit: 250,
      },
    );
    if (error) {
      throw new Error(`Database historical aggregation failed: ${error.message}`);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Database historical aggregation returned an invalid payload");
    }
    return data as HistoricalPayload;
  })();

  payloadCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, promise });
  void promise.catch(() => {
    if (payloadCache.get(cacheKey)?.promise === promise) payloadCache.delete(cacheKey);
  });
  return promise;
}

function buildReasons(row: HistoricalCountryRow) {
  const editions = integer(row.unique_editions);
  const supportRate = number(row.support_rate);
  const maximumRate = number(row.maximum_rate);
  const reciprocalRate = number(row.reciprocal_rate);
  const reciprocalEditions = integer(row.reciprocal_editions);
  const crossChannelEditions = integer(row.cross_channel_editions);
  const reasons: string[] = [];

  if (editions >= 2 && supportRate >= 0.6) {
    reasons.push(`Support appears in ${pctNumber(supportRate)}% of the available relationship observations`);
  }
  if (editions >= 2 && maximumRate >= 0.3) {
    reasons.push(`Maximum-score support appears in ${pctNumber(maximumRate)}% of the available relationship observations`);
  }
  if (reciprocalEditions > 0 && reciprocalRate >= 0.5) {
    reasons.push(`Reciprocal support appears in ${pctNumber(reciprocalRate)}% of comparable editions`);
  }
  if (crossChannelEditions > 0) {
    reasons.push(
      `Support appears in both jury and televote in ${crossChannelEditions} edition${crossChannelEditions === 1 ? "" : "s"}`,
    );
  }
  return reasons;
}

function buildWarnings(row: HistoricalCountryRow) {
  const warnings = [
    "Historical summary mode uses descriptive relationship-pattern strength only; advanced anomaly, baseline-deviation, similarity and network signals are not calculated.",
  ];
  if (integer(row.unique_editions) < 3) {
    warnings.push("Limited edition history; pattern score is deliberately capped by the available evidence.");
  }
  return warnings;
}

function mapRelationship(row: HistoricalCountryRow): IntelligencePair | null {
  const voterCode = code(row.voter_code);
  const targetCode = code(row.target_code);
  if (!voterCode || !targetCode) return null;

  const votingCountry = text(row.voting_country_name) || voterCode;
  const targetCountry = text(row.target_country_name) || targetCode;
  const opportunities = integer(row.opportunities);
  const supported = integer(row.supported);
  const maximumScores = integer(row.maximum_scores);
  const points = number(row.points);
  const uniqueEditions = integer(row.unique_editions);
  const supportEditions = integer(row.support_editions);
  const maximumEditions = integer(row.maximum_editions);
  const reciprocalEditions = integer(row.reciprocal_editions);
  const crossChannelEditions = integer(row.cross_channel_editions);
  const televoteOpportunities = integer(row.televote_opportunities);
  const televoteSupported = integer(row.televote_supported);
  const juryOpportunities = integer(row.jury_opportunities);
  const jurySupported = integer(row.jury_supported);
  const historicalOpportunities = integer(row.historical_opportunities);
  const historicalSupported = integer(row.historical_supported);
  const historicalMaximum = integer(row.historical_maximum);
  const historicalAverageScore = number(row.historical_average_score);
  const supportRate = number(row.support_rate);
  const reciprocalRate = number(row.reciprocal_rate);

  return {
    identityKey: voterCode,
    controllerPersonId: null,
    controllerName: null,
    votingCountry,
    votingCountries: [votingCountry],
    targetCountry,
    targetCode,
    opportunities,
    supported,
    supportFrequency: pctNumber(uniqueEditions ? supportEditions / uniqueEditions : 0),
    maximumScores,
    maximumFrequency: pctNumber(uniqueEditions ? maximumEditions / uniqueEditions : 0),
    points,
    averagePoints: round2(opportunities ? points / opportunities : 0),
    normalizedAverage: pctNumber(number(row.outer_normalized_average)),
    reciprocalSupport: pctNumber(reciprocalRate),
    uniqueEditions,
    crossChannelEditions,
    televoteOpportunities,
    televoteSupportFrequency: pctNumber(televoteOpportunities ? televoteSupported / televoteOpportunities : 0),
    televotePoints: number(row.televote_points),
    juryOpportunities,
    jurySupportFrequency: pctNumber(juryOpportunities ? jurySupported / juryOpportunities : 0),
    juryPoints: number(row.jury_points),
    riskScore: integer(row.risk_score),
    confidence: integer(row.confidence),
    reasons: buildReasons(row),
    warnings: buildWarnings(row),
    juryRisk: integer(row.jury_risk),
    televoteRisk: integer(row.televote_risk),
    crossChannelRisk: integer(row.cross_channel_risk),
    relationshipAnomaly: integer(row.relationship_anomaly),
    reciprocityRisk: integer(row.reciprocity_risk),
    intensityRisk: integer(row.intensity_risk),
    historicalDeviationRisk: 0,
    rankPatternRisk: 0,
    networkRisk: 0,
    countryStrengthRisk: 0,
    evidence: {
      observedSupport: historicalSupported,
      eligibleSupport: historicalOpportunities,
      smoothedSupportRate: supportRate,
      averageScore: historicalAverageScore,
      expectedAverageScore: 0,
      maximumScores: historicalMaximum,
      reciprocalEditions,
      reciprocalSupportEditions: Math.round(Math.max(0, Math.min(1, reciprocalRate)) * reciprocalEditions),
      crossChannelEditions,
      historicalMaxScoreRate: 0,
      observedRankPercentile: 0,
      expectedRankPercentile: 0,
    },
    modelVersion: FRIEND_VOTING_HISTORICAL_MODEL_VERSION,
  };
}

function buildSignals(
  submissions: HistoricalSubmission[],
  countryNames: Record<string, unknown>,
): IntelligenceSignal[] {
  const name = (countryCode: string) => text(countryNames[countryCode]) || countryCode;
  const usernameCountries = new Map<string, Set<string>>();
  const vpnCountries = new Map<string, number>();
  const highRiskCountries = new Map<string, number>();
  const suspiciousCountries = new Map<string, number>();

  for (const submission of submissions) {
    const countryCode = code(submission.countryCode);
    if (!countryCode) continue;
    const normalized = text(submission.usernameNormalized).toLowerCase();
    const fallback = text(submission.username).toLowerCase();
    const username = normalized || fallback;
    if (username) {
      const countries = usernameCountries.get(username) ?? new Set<string>();
      countries.add(countryCode);
      usernameCountries.set(username, countries);
    }
    if (submission.isVpn === true) vpnCountries.set(countryCode, (vpnCountries.get(countryCode) ?? 0) + 1);
    if (number(submission.riskScore) >= 65) highRiskCountries.set(countryCode, (highRiskCountries.get(countryCode) ?? 0) + 1);
    if (text(submission.status) === "suspicious") {
      suspiciousCountries.set(countryCode, (suspiciousCountries.get(countryCode) ?? 0) + 1);
    }
  }

  const multiCountryUsernames = [...usernameCountries.entries()].filter(([, countries]) => countries.size > 1);
  const signals: IntelligenceSignal[] = [];
  const topCountries = (counts: Map<string, number>) =>
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([countryCode]) => name(countryCode));
  const total = (counts: Map<string, number>) => [...counts.values()].reduce((sum, value) => sum + value, 0);
  const push = (signal: IntelligenceSignal) => {
    if (signal.count > 0) signals.push(signal);
  };

  push({
    key: "suspicious",
    severity: suspiciousCountries.size > 5 ? "high" : "medium",
    title: "Ballots marked suspicious",
    description: "Moderator or automated integrity review has placed these ballots in the suspicious state.",
    count: total(suspiciousCountries),
    countries: topCountries(suspiciousCountries),
  });
  push({
    key: "high-risk",
    severity: "high",
    title: "High-risk ballots",
    description: "Ballots with stored technical/integrity risk score 65 or higher should receive organizer attention.",
    count: total(highRiskCountries),
    countries: topCountries(highRiskCountries),
  });
  push({
    key: "vpn",
    severity: "medium",
    title: "VPN / proxy evidence",
    description: "VPN evidence remains supporting technical information only. It never defines HOD identity or proves coordinated voting by itself.",
    count: total(vpnCountries),
    countries: topCountries(vpnCountries),
  });
  push({
    key: "username-cross-country",
    severity: multiCountryUsernames.length > 4 ? "high" : "medium",
    title: "Usernames seen across multiple countries",
    description: "Username reuse is supporting identity evidence. Historical HOD attribution comes from the canonical HOD assignment layer, not this heuristic.",
    count: multiCountryUsernames.length,
    countries: [...new Set(multiCountryUsernames.flatMap(([, countries]) => [...countries]))]
      .slice(0, 8)
      .map(name),
  });

  return signals;
}

export async function getHistoricalCountryIntelligenceServer(options: HistoricalCountryOptions) {
  // Authenticate before consulting the shared short-lived cache. Cached voting intelligence must never become an auth bypass.
  await requireMergedTelevotingAdminServer();
  const payload = await cachedPayload(options);
  const rows = Array.isArray(payload.relationships) ? payload.relationships : [];
  const relationships = rows.map(mapRelationship).filter((row): row is IntelligencePair => row !== null);
  const rawStats = payload.stats && typeof payload.stats === "object" ? payload.stats : {};
  const submissions = Array.isArray(payload.submissions) ? payload.submissions : [];
  const countryNames = payload.countries && typeof payload.countries === "object" ? payload.countries : {};
  const editions = Array.isArray(payload.editions)
    ? payload.editions
        .map((edition) => ({
          id: text(edition.id),
          name: text(edition.name),
          editionNumber: edition.editionNumber == null ? null : integer(edition.editionNumber),
        }))
        .filter((edition) => edition.id)
    : [];

  return {
    stats: {
      ballots: integer(rawStats.ballots),
      active: integer(rawStats.active),
      deleted: integer(rawStats.deleted),
      suspicious: integer(rawStats.suspicious),
      verified: integer(rawStats.verified),
      highRisk: integer(rawStats.highRisk),
      vpn: integer(rawStats.vpn),
      rounds: integer(rawStats.rounds),
      juryBallots: integer(rawStats.juryBallots),
      juryVotes: integer(rawStats.juryVotes),
      relationships: integer(rawStats.relationships),
      attentionRelationships: integer(rawStats.attentionRelationships),
      hodAssignedEditionCountries: 0,
      hodUnknownEditionCountries: 0,
    },
    signals: buildSignals(submissions, countryNames),
    relationships,
    filters: {
      lens: "country" as const,
      channel: options.channel,
      hodPersonId: null,
      editionId: options.editionId ?? null,
      people: [],
      editions,
    },
  };
}
