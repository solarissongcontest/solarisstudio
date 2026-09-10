import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import {
  calculateAdvancedFriendVotingRisk,
  FRIEND_VOTING_MODEL_VERSION,
  type AdvancedFriendVotingObservation,
} from "@/integrations/televoting/advanced-friend-voting";
import {
  canonicalEditionForRound,
  loadCanonicalVotingContextServer,
} from "@/integrations/televoting/canonical-context.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import type { FriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.server";
import { recentEditionWeight } from "@/integrations/televoting/history-weighting";
import type {
  IntelligenceOptions,
  IntelligencePair,
  IntelligenceSignal,
} from "@/integrations/televoting/intelligence.server";

export const FRIEND_VOTING_ENGINE_VERSION = "friend-voting-engine-v5-prepared";

type Submission = {
  id: string;
  round_id: string;
  country_code: string;
  username: string;
  username_normalized: string;
  ip_country: string | null;
  is_vpn: boolean;
  risk_score: number;
  status: string | null;
  created_at: string;
};

type Entry = {
  submission_id: string;
  target_country_code: string;
  points: number;
};

type RoundEntry = {
  round_id: string;
  entry_key: string;
  country_code: string | null;
};

type Round = {
  id: string;
  name: string;
  edition_id: string;
  status: string;
};

type Country = {
  code: string;
  name: string;
};

type Observation = {
  identityKey: string;
  controllerPersonId: string | null;
  controllerName: string | null;
  editionId: string;
  editionNumber: number | null;
  showOrRoundId: string;
  channel: "televote" | "jury";
  voterCountryCode: string;
  targetCountryCode: string;
  rawScore: number;
  score: number;
  maxScore: number;
  normalized: number;
  supported: boolean;
  maximum: boolean;
  rank: number | null;
  participantCount: number;
};

type PairAccumulator = {
  identityKey: string;
  controllerPersonId: string | null;
  controllerName: string | null;
  votingCountries: Set<string>;
  targetCode: string;
  opportunities: number;
  supported: number;
  max: number;
  points: number;
  editions: Set<string>;
  televote: { opportunities: number; supported: number; points: number; max: number };
  jury: { opportunities: number; supported: number; points: number; max: number };
  supportChannelsByEdition: Map<string, Set<string>>;
  maximumEditions: Set<string>;
  observations: Observation[];
};

type Coverage = {
  editionId: string;
  voterCode: string;
  personId: string | null;
};

type PreparedAdvancedContext = {
  advancedAll: AdvancedFriendVotingObservation[];
  reciprocalIndex: Map<string, Observation[]>;
  currentEditionNumber: number | null;
  pairs: Map<string, Observation[]>;
};

const pct = (value: number) => Math.round(value * 1000) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();

function ranksForScores(rows: Array<{ target: string; score: number }>) {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.target.localeCompare(b.target));
  const map = new Map<string, number>();
  let previous: number | null = null;
  let rank = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index]!;
    if (previous == null || row.score !== previous) rank = index + 1;
    map.set(row.target, rank);
    previous = row.score;
  }
  return map;
}

function normalizeScore(score: number, maxScore: number) {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return Math.max(0, Math.min(1, score / maxScore));
}

/**
 * The advanced model compares jury, modern televote and legacy sources.
 * Raw point scales differ wildly (for example SSC21 Story voting is 0–100),
 * so the model receives a common 0–100 intensity score while raw points are
 * retained on Observation for organizer evidence.
 */
function advancedObservation(row: Observation): AdvancedFriendVotingObservation {
  return {
    editionId: row.editionId,
    editionNumber: row.editionNumber,
    channel: row.channel,
    voterId: row.identityKey,
    targetCode: row.targetCountryCode,
    score: row.normalized * 100,
    maxScore: 100,
    supported: row.supported,
    maximum: row.maximum,
    rank: row.rank,
    participantCount: row.participantCount,
  };
}

function reciprocalKey(
  editionId: string,
  channel: Observation["channel"],
  voterCountryCode: string,
  targetCode: string,
) {
  return `${editionId}\u0000${channel}\u0000${voterCountryCode}\u0000${targetCode}`;
}

function prepareAdvancedContext(
  historicalScope: Observation[],
  pairScope: Observation[],
): PreparedAdvancedContext {
  const advancedAll = historicalScope.map(advancedObservation);
  const reciprocalIndex = new Map<string, Observation[]>();
  let currentEditionNumber: number | null = null;

  for (const row of historicalScope) {
    if (row.editionNumber != null && Number.isFinite(row.editionNumber)) {
      currentEditionNumber = currentEditionNumber == null
        ? row.editionNumber
        : Math.max(currentEditionNumber, row.editionNumber);
    }

    const key = reciprocalKey(
      row.editionId,
      row.channel,
      row.voterCountryCode,
      row.targetCountryCode,
    );
    const list = reciprocalIndex.get(key) ?? [];
    list.push(row);
    reciprocalIndex.set(key, list);
  }

  const pairs = new Map<string, Observation[]>();
  for (const row of pairScope) {
    const key = `${row.identityKey}\u0000${row.targetCountryCode}`;
    const list = pairs.get(key) ?? [];
    list.push(row);
    pairs.set(key, list);
  }

  return {
    advancedAll,
    reciprocalIndex,
    currentEditionNumber,
    pairs,
  };
}

function reciprocalEvidence(
  pair: Observation[],
  context: PreparedAdvancedContext,
) {
  const byEdition = new Map<string, { weight: number; reciprocal: boolean }>();

  for (const row of pair) {
    const reverse = context.reciprocalIndex.get(
      reciprocalKey(
        row.editionId,
        row.channel,
        row.targetCountryCode,
        row.voterCountryCode,
      ),
    ) ?? [];
    if (!reverse.length) continue;

    const age =
      context.currentEditionNumber != null && row.editionNumber != null
        ? Math.max(0, context.currentEditionNumber - row.editionNumber)
        : 0;
    const item = byEdition.get(row.editionId) ?? {
      weight: recentEditionWeight(age),
      reciprocal: false,
    };
    if (row.supported && reverse.some((candidate) => candidate.supported)) {
      item.reciprocal = true;
    }
    byEdition.set(row.editionId, item);
  }

  const values = [...byEdition.values()];
  const denominator = values.reduce((sum, row) => sum + row.weight, 0);
  return {
    rate: denominator
      ? values
          .filter((row) => row.reciprocal)
          .reduce((sum, row) => sum + row.weight, 0) / denominator
      : 0,
    editions: values.length,
  };
}

function scopeError(stage: string, requestId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[friend-voting-v5]", {
    requestId,
    stage,
    message,
    error,
  });
  const wrapped = new Error(
    `Friend Voting failed during ${stage}. Request ${requestId}. ${message}`,
  ) as Error & { statusCode?: number };
  wrapped.statusCode = 500;
  return wrapped;
}

export async function getMergedIntelligenceV5Server(
  options: IntelligenceOptions,
  settings: FriendVotingSettings,
) {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `fv-${Date.now().toString(36)}`;
  const startedAt = Date.now();
  let stage = "authorization";

  try {
    await requireMergedTelevotingAdminServer();

    stage = "canonical-context";
    const lens = options.lens === "country" ? "country" : "hod";
    const channel =
      options.channel === "jury" || options.channel === "televote"
        ? options.channel
        : "combined";
    const canonical = await loadCanonicalVotingContextServer();

    const editionNumber = (id: string) => {
      const row = canonical.hod.editionsById.get(id) as any;
      return row?.edition_number == null ? null : Number(row.edition_number);
    };
    const selectedEditionNumber = options.editionId
      ? editionNumber(options.editionId)
      : null;

    const countriesWithHodHistory = new Set(
      canonical.hod.assignments.map((assignment: any) => String(assignment.country_id)),
    );
    const shouldUseCountryFallback = (countryId: string | null | undefined) =>
      lens === "hod" &&
      Boolean(countryId) &&
      !countriesWithHodHistory.has(String(countryId));

    stage = "televote-metadata";
    const [roundResult, roundEntryResult, countryResult] = await Promise.all([
      televotingAdmin
        .from("rounds")
        .select("id,name,edition_id,status")
        .order("created_at", { ascending: true }),
      televotingAdmin
        .from("round_entries")
        .select("round_id,entry_key,country_code"),
      televotingAdmin.from("countries").select("code,name"),
    ]);
    for (const result of [roundResult, roundEntryResult, countryResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const rounds = (roundResult.data ?? []) as Round[];
    const roundEntries = (roundEntryResult.data ?? []) as RoundEntry[];
    const countries = (countryResult.data ?? []) as Country[];

    const countryName = new Map(
      countries.map((country) => [upper(country.code), country.name]),
    );
    for (const country of canonical.hod.countries) {
      const code = upper((country as any).short_code);
      if (code && !countryName.has(code)) {
        countryName.set(code, String((country as any).name));
      }
    }

    const canonicalEditionByRound = new Map<string, string>();
    const historicalRoundIds = new Set<string>();
    const currentRoundIds = new Set<string>();

    for (const round of rounds) {
      const id = canonicalEditionForRound(canonical, round);
      if (!id) continue;
      canonicalEditionByRound.set(round.id, id);

      const number = editionNumber(id);
      const allowedForHistory =
        !options.editionId ||
        id === options.editionId ||
        (selectedEditionNumber != null &&
          number != null &&
          number < selectedEditionNumber);

      if (allowedForHistory) historicalRoundIds.add(round.id);
      if (!options.editionId || id === options.editionId) currentRoundIds.add(round.id);
    }

    const participantsByRound = new Map<string, Set<string>>();
    for (const entry of roundEntries) {
      if (!historicalRoundIds.has(entry.round_id)) continue;
      const target = upper(entry.country_code || entry.entry_key);
      if (!target) continue;
      const set = participantsByRound.get(entry.round_id) ?? new Set<string>();
      set.add(target);
      participantsByRound.set(entry.round_id, set);
    }

    stage = "televote-submissions";
    let allSubmissions: Submission[] = [];
    let voteEntries: Entry[] = [];

    if (channel !== "jury" && historicalRoundIds.size) {
      const submissionResult = await televotingAdmin
        .from("vote_submissions")
        .select(
          "id,round_id,country_code,username,username_normalized,ip_country,is_vpn,risk_score,status,created_at",
        )
        .in("round_id", [...historicalRoundIds])
        .order("created_at", { ascending: true })
        .limit(50000);
      if (submissionResult.error) throw new Error(submissionResult.error.message);

      allSubmissions = (submissionResult.data ?? []) as Submission[];
      const activeSubmissionIds = allSubmissions
        .filter((submission) => submission.status !== "deleted")
        .map((submission) => submission.id);

      if (activeSubmissionIds.length) {
        const voteEntryResult = await televotingAdmin
          .from("vote_entries")
          .select("submission_id,target_country_code,points")
          .in("submission_id", activeSubmissionIds)
          .limit(250000);
        if (voteEntryResult.error) throw new Error(voteEntryResult.error.message);
        voteEntries = (voteEntryResult.data ?? []) as Entry[];
      }
    }

    const activeSubmissions = allSubmissions.filter(
      (submission) => submission.status !== "deleted",
    );
    const activeSubmissionIds = new Set(
      activeSubmissions.map((submission) => submission.id),
    );
    const entriesBySubmission = new Map<string, Entry[]>();
    for (const entry of voteEntries) {
      if (!activeSubmissionIds.has(entry.submission_id)) continue;
      const list = entriesBySubmission.get(entry.submission_id) ?? [];
      list.push(entry);
      entriesBySubmission.set(entry.submission_id, list);
    }

    stage = "observation-build";
    const historicalObservations: Observation[] = [];
    const coverage: Coverage[] = [];

    if (channel !== "jury") {
      for (const submission of activeSubmissions) {
        if (!historicalRoundIds.has(submission.round_id)) continue;
        const editionId = canonicalEditionByRound.get(submission.round_id);
        if (!editionId) continue;

        const voterCode = upper(submission.country_code);
        const voterCountry = canonical.hod.countriesByCode.get(voterCode) as any;
        const countryId = voterCountry?.id ? String(voterCountry.id) : null;
        const hod = canonical.hod.resolve(editionId, countryId, "televote");
        const countryFallback = !hod && shouldUseCountryFallback(countryId);
        coverage.push({ editionId, voterCode, personId: hod?.personId ?? null });

        if (lens === "hod" && !hod && !countryFallback) continue;
        if (options.hodPersonId && hod?.personId !== options.hodPersonId) continue;

        const identity =
          lens === "country"
            ? `country:${voterCode}`
            : hod
              ? `hod:${hod.personId}`
              : `country-fallback:${voterCode}`;

        const points = new Map(
          (entriesBySubmission.get(submission.id) ?? []).map((entry) => [
            upper(entry.target_country_code),
            Number(entry.points ?? 0),
          ]),
        );
        const targets = [
          ...(participantsByRound.get(submission.round_id) ?? new Set<string>()),
        ].filter((target) => target && target !== voterCode);

        const scoreRows = targets.map((target) => ({
          target,
          score: points.get(target) ?? 0,
        }));
        const rankByTarget = ranksForScores(scoreRows);
        const rawMaxScore = Math.max(0, ...scoreRows.map((row) => row.score));

        for (const { target, score } of scoreRows) {
          const normalized = normalizeScore(score, rawMaxScore);
          historicalObservations.push({
            identityKey: identity,
            controllerPersonId: hod?.personId ?? null,
            controllerName: lens === "hod" && hod ? hod.displayName : null,
            editionId,
            editionNumber: editionNumber(editionId),
            showOrRoundId: submission.round_id,
            channel: "televote",
            voterCountryCode: voterCode,
            targetCountryCode: target,
            rawScore: score,
            score,
            maxScore: rawMaxScore,
            normalized,
            supported: score > 0,
            maximum: score > 0 && score === rawMaxScore,
            rank: rankByTarget.get(target) ?? null,
            participantCount: scoreRows.length,
          });
        }
      }
    }

    if (channel !== "televote") {
      const votesByBallot = new Map<string, typeof canonical.juryVotes>();
      for (const vote of canonical.juryVotes) {
        if (!vote.voter_country_id) continue;
        const editionId = String(vote.edition_id);
        const number = editionNumber(editionId);
        const allowedForHistory =
          !options.editionId ||
          editionId === options.editionId ||
          (selectedEditionNumber != null &&
            number != null &&
            number < selectedEditionNumber);
        if (!allowedForHistory) continue;

        const key = `${editionId}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
        const list = votesByBallot.get(key) ?? [];
        list.push(vote);
        votesByBallot.set(key, list);
      }

      for (const [ballotKey, ballotVotes] of votesByBallot) {
        const first = ballotVotes[0];
        if (!first?.voter_country_id) continue;

        const editionId = String(first.edition_id);
        const voterCountry = canonical.hod.countriesById.get(
          first.voter_country_id,
        ) as any;
        if (!voterCountry) continue;

        const voterCode = upper(voterCountry.short_code ?? voterCountry.name);
        const countryId = String(first.voter_country_id);
        const hod = canonical.hod.resolve(editionId, countryId, "jury");
        const countryFallback = !hod && shouldUseCountryFallback(countryId);
        coverage.push({ editionId, voterCode, personId: hod?.personId ?? null });

        if (lens === "hod" && !hod && !countryFallback) continue;
        if (options.hodPersonId && hod?.personId !== options.hodPersonId) continue;

        const identity =
          lens === "country"
            ? `country:${voterCode}`
            : hod
              ? `hod:${hod.personId}`
              : `country-fallback:${voterCode}`;

        const scoreByTarget = new Map<string, number>();
        for (const vote of ballotVotes) {
          if (!vote.receiving_country_id) continue;
          const target = canonical.hod.countriesById.get(
            vote.receiving_country_id,
          ) as any;
          if (target) {
            scoreByTarget.set(
              upper(target.short_code ?? target.name),
              Number(vote.points ?? 0),
            );
          }
        }

        const participantIds = first.show_id
          ? canonical.participantsByShow.get(String(first.show_id)) ??
            new Set<string>()
          : canonical.editionParticipants.get(editionId) ?? new Set<string>();

        const scoreRows: Array<{ target: string; score: number }> = [];
        for (const targetCountryId of participantIds) {
          if (targetCountryId === first.voter_country_id) continue;
          const target = canonical.hod.countriesById.get(targetCountryId) as any;
          if (!target) continue;
          const targetCode = upper(target.short_code ?? target.name);
          scoreRows.push({
            target: targetCode,
            score: scoreByTarget.get(targetCode) ?? 0,
          });
        }

        const rankByTarget = ranksForScores(scoreRows);
        const rawMaxScore = Math.max(0, ...scoreRows.map((row) => row.score));

        for (const { target, score } of scoreRows) {
          const normalized = normalizeScore(score, rawMaxScore);
          historicalObservations.push({
            identityKey: identity,
            controllerPersonId: hod?.personId ?? null,
            controllerName: lens === "hod" && hod ? hod.displayName : null,
            editionId,
            editionNumber: editionNumber(editionId),
            showOrRoundId: String(first.show_id ?? ballotKey),
            channel: "jury",
            voterCountryCode: voterCode,
            targetCountryCode: target,
            rawScore: score,
            score,
            maxScore: rawMaxScore,
            normalized,
            supported: score > 0,
            maximum: score > 0 && score === rawMaxScore,
            rank: rankByTarget.get(target) ?? null,
            participantCount: scoreRows.length,
          });
        }
      }
    }

    const pairScope = historicalObservations.filter((observation) => {
      if (options.editionId && observation.editionId !== options.editionId) {
        return false;
      }
      if (
        options.hodPersonId &&
        observation.controllerPersonId !== options.hodPersonId
      ) {
        return false;
      }
      return true;
    });

    stage = "advanced-context";
    const context = prepareAdvancedContext(historicalObservations, pairScope);

    const pairs = new Map<string, PairAccumulator>();
    for (const observation of pairScope) {
      const key = `${observation.identityKey}\u0000${observation.targetCountryCode}`;
      const current = pairs.get(key) ?? {
        identityKey: observation.identityKey,
        controllerPersonId: observation.controllerPersonId,
        controllerName: observation.controllerName,
        votingCountries: new Set<string>(),
        targetCode: observation.targetCountryCode,
        opportunities: 0,
        supported: 0,
        max: 0,
        points: 0,
        editions: new Set<string>(),
        televote: { opportunities: 0, supported: 0, points: 0, max: 0 },
        jury: { opportunities: 0, supported: 0, points: 0, max: 0 },
        supportChannelsByEdition: new Map<string, Set<string>>(),
        maximumEditions: new Set<string>(),
        observations: [],
      };

      current.votingCountries.add(observation.voterCountryCode);
      current.opportunities += 1;
      current.points += observation.rawScore;
      current.editions.add(observation.editionId);
      current.observations.push(observation);

      if (observation.supported) {
        current.supported += 1;
        const channels =
          current.supportChannelsByEdition.get(observation.editionId) ??
          new Set<string>();
        channels.add(observation.channel);
        current.supportChannelsByEdition.set(observation.editionId, channels);
      }
      if (observation.maximum) {
        current.max += 1;
        current.maximumEditions.add(observation.editionId);
      }

      const bucket = current[observation.channel];
      bucket.opportunities += 1;
      bucket.points += observation.rawScore;
      if (observation.supported) bucket.supported += 1;
      if (observation.maximum) bucket.max += 1;
      pairs.set(key, current);
    }

    stage = "advanced-relationship-analysis";
    const relationships: IntelligencePair[] = [];

    for (const value of pairs.values()) {
      const uniqueEditions = value.editions.size;
      const supportFrequency = uniqueEditions
        ? value.supportChannelsByEdition.size / uniqueEditions
        : 0;
      const maximumFrequency = uniqueEditions
        ? value.maximumEditions.size / uniqueEditions
        : 0;

      const normalizedByEdition = new Map<string, number[]>();
      for (const row of value.observations) {
        const list = normalizedByEdition.get(row.editionId) ?? [];
        list.push(row.normalized);
        normalizedByEdition.set(row.editionId, list);
      }
      const normalizedAverage = normalizedByEdition.size
        ? [...normalizedByEdition.values()].reduce(
            (sum, rows) =>
              sum +
              rows.reduce((a, b) => a + b, 0) / Math.max(1, rows.length),
            0,
          ) / normalizedByEdition.size
        : 0;

      const reciprocal = reciprocalEvidence(value.observations, context);
      const crossChannelEditions = [
        ...value.supportChannelsByEdition.values(),
      ].filter(
        (channels) => channels.has("jury") && channels.has("televote"),
      ).length;

      const result = calculateAdvancedFriendVotingRisk(
        value.observations.map(advancedObservation),
        context.advancedAll,
        reciprocal.rate,
        reciprocal.editions,
        null,
        {
          ...settings.advancedModel,
          mode: "advanced",
        },
      );

      const votingCodes = [...value.votingCountries].sort();
      const votingNames = votingCodes.map(
        (code) => countryName.get(code) ?? code,
      );
      const targetName = countryName.get(value.targetCode) ?? value.targetCode;
      const televoteFrequency = value.televote.opportunities
        ? value.televote.supported / value.televote.opportunities
        : 0;
      const juryFrequency = value.jury.opportunities
        ? value.jury.supported / value.jury.opportunities
        : 0;
      const countryFallback = value.identityKey.startsWith(
        "country-fallback:",
      );

      relationships.push({
        identityKey: value.identityKey,
        controllerPersonId: value.controllerPersonId,
        controllerName: value.controllerName,
        votingCountry: votingNames.join(" / "),
        votingCountries: votingNames,
        targetCountry: targetName,
        targetCode: value.targetCode,
        opportunities: value.opportunities,
        supported: value.supported,
        supportFrequency: pct(supportFrequency),
        maximumScores: value.max,
        maximumFrequency: pct(maximumFrequency),
        points: value.points,
        averagePoints: round2(
          value.opportunities ? value.points / value.opportunities : 0,
        ),
        normalizedAverage: pct(normalizedAverage),
        reciprocalSupport: pct(reciprocal.rate),
        uniqueEditions,
        crossChannelEditions,
        televoteOpportunities: value.televote.opportunities,
        televoteSupportFrequency: pct(televoteFrequency),
        televotePoints: value.televote.points,
        juryOpportunities: value.jury.opportunities,
        jurySupportFrequency: pct(juryFrequency),
        juryPoints: value.jury.points,
        riskScore: result.overallRisk,
        confidence: result.confidence,
        reasons: result.reasons,
        warnings: countryFallback
          ? [
              "No HOD history is configured for this country, so analytics uses the country identity across all available editions.",
              ...result.warnings,
            ]
          : result.warnings,
        juryRisk: result.juryRisk,
        televoteRisk: result.televoteRisk,
        crossChannelRisk: result.crossChannelRisk,
        relationshipAnomaly: result.relationshipAnomaly,
        reciprocityRisk: result.reciprocityRisk,
        intensityRisk: result.intensityRisk,
        historicalDeviationRisk: result.historicalDeviationRisk,
        rankPatternRisk: result.rankPatternRisk,
        networkRisk: result.networkRisk,
        countryStrengthRisk: result.countryStrengthRisk,
        evidence: result.evidence,
        modelVersion: FRIEND_VOTING_MODEL_VERSION,
      });
    }

    relationships.sort(
      (a, b) =>
        b.riskScore - a.riskScore ||
        b.confidence - a.confidence ||
        b.uniqueEditions - a.uniqueEditions ||
        b.opportunities - a.opportunities,
    );

    stage = "integrity-signals";
    const currentSubmissionIds = new Set(
      activeSubmissions
        .filter((submission) => currentRoundIds.has(submission.round_id))
        .filter((submission) => {
          if (!options.hodPersonId) return true;
          const editionId = canonicalEditionByRound.get(submission.round_id);
          if (!editionId) return false;
          const country = canonical.hod.countriesByCode.get(
            upper(submission.country_code),
          ) as any;
          return (
            canonical.hod.resolve(
              editionId,
              country?.id ? String(country.id) : null,
              "televote",
            )?.personId === options.hodPersonId
          );
        })
        .map((submission) => submission.id),
    );
    const filteredSubmissions = activeSubmissions.filter((submission) =>
      currentSubmissionIds.has(submission.id),
    );

    const juryVotesInScope = canonical.juryVotes.filter((vote) => {
      if (!vote.voter_country_id) return false;
      if (options.editionId && String(vote.edition_id) !== options.editionId) {
        return false;
      }
      if (
        options.hodPersonId &&
        canonical.hod.resolve(
          String(vote.edition_id),
          String(vote.voter_country_id),
          "jury",
        )?.personId !== options.hodPersonId
      ) {
        return false;
      }
      return true;
    });

    const usernameCounts = new Map<string, Set<string>>();
    const vpnCountries = new Map<string, number>();
    const highRiskCountries = new Map<string, number>();
    const suspiciousCountries = new Map<string, number>();

    for (const submission of filteredSubmissions) {
      const user =
        submission.username_normalized ||
        String(submission.username ?? "").toLowerCase();
      const countriesForUser =
        usernameCounts.get(user) ?? new Set<string>();
      countriesForUser.add(submission.country_code);
      usernameCounts.set(user, countriesForUser);

      if (submission.is_vpn) {
        vpnCountries.set(
          submission.country_code,
          (vpnCountries.get(submission.country_code) ?? 0) + 1,
        );
      }
      if (Number(submission.risk_score ?? 0) >= 65) {
        highRiskCountries.set(
          submission.country_code,
          (highRiskCountries.get(submission.country_code) ?? 0) + 1,
        );
      }
      if (submission.status === "suspicious") {
        suspiciousCountries.set(
          submission.country_code,
          (suspiciousCountries.get(submission.country_code) ?? 0) + 1,
        );
      }
    }

    const multiCountryUsernames = [...usernameCounts.entries()].filter(
      ([, codes]) => codes.size > 1,
    );
    const signals: IntelligenceSignal[] = [];
    const pushSignal = (signal: IntelligenceSignal) => {
      if (signal.count > 0) signals.push(signal);
    };

    if (channel !== "jury") {
      pushSignal({
        key: "suspicious",
        severity: suspiciousCountries.size > 5 ? "high" : "medium",
        title: "Ballots marked suspicious",
        description:
          "Stored moderator or automated integrity state. This is separate from Friend Voting relationship-pattern analysis.",
        count: [...suspiciousCountries.values()].reduce((a, b) => a + b, 0),
        countries: [...suspiciousCountries.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([code]) => countryName.get(upper(code)) ?? code),
      });
      pushSignal({
        key: "high-risk",
        severity: "high",
        title: "Technical high-risk ballots",
        description:
          "Ballots with stored technical/integrity risk score 65 or higher. A strong Friend Voting relationship score alone never creates this flag.",
        count: [...highRiskCountries.values()].reduce((a, b) => a + b, 0),
        countries: [...highRiskCountries.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([code]) => countryName.get(upper(code)) ?? code),
      });
      pushSignal({
        key: "vpn",
        severity: "medium",
        title: "VPN / proxy evidence",
        description:
          "VPN evidence is supporting technical information only; it does not prove coordinated voting.",
        count: [...vpnCountries.values()].reduce((a, b) => a + b, 0),
        countries: [...vpnCountries.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([code]) => countryName.get(upper(code)) ?? code),
      });
      pushSignal({
        key: "username-cross-country",
        severity: multiCountryUsernames.length > 4 ? "high" : "medium",
        title: "Usernames seen across multiple countries",
        description:
          "Username reuse is supporting identity evidence only. Historical HOD attribution comes from canonical assignments.",
        count: multiCountryUsernames.length,
        countries: [
          ...new Set(
            multiCountryUsernames.flatMap(([, codes]) => [...codes]),
          ),
        ]
          .slice(0, 8)
          .map((code) => countryName.get(upper(code)) ?? code),
      });
    }

    const scopedCoverage = coverage.filter((row) => {
      if (options.editionId && row.editionId !== options.editionId) return false;
      if (options.hodPersonId && row.personId !== options.hodPersonId) return false;
      return true;
    });
    const hodEditionCoverage = new Set(
      scopedCoverage
        .filter((row) => row.personId)
        .map((row) => `${row.editionId}:${row.voterCode}`),
    );
    const unknownHodEditionCoverage = new Set(
      scopedCoverage
        .filter((row) => !row.personId)
        .map((row) => `${row.editionId}:${row.voterCode}`),
    );
    const juryBallotCount =
      channel === "televote"
        ? 0
        : new Set(
            juryVotesInScope.map(
              (vote) =>
                `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`,
            ),
          ).size;

    const stats = {
      ballots: channel === "jury" ? 0 : filteredSubmissions.length,
      active: channel === "jury" ? 0 : filteredSubmissions.length,
      deleted: 0,
      suspicious:
        channel === "jury"
          ? 0
          : filteredSubmissions.filter((row) => row.status === "suspicious")
              .length,
      verified:
        channel === "jury"
          ? 0
          : filteredSubmissions.filter((row) => row.status === "verified")
              .length,
      highRisk:
        channel === "jury"
          ? 0
          : filteredSubmissions.filter(
              (row) => Number(row.risk_score ?? 0) >= 65,
            ).length,
      vpn:
        channel === "jury"
          ? 0
          : filteredSubmissions.filter((row) => row.is_vpn).length,
      rounds: currentRoundIds.size,
      juryBallots: juryBallotCount,
      juryVotes: channel === "televote" ? 0 : juryVotesInScope.length,
      relationships: relationships.length,
      attentionRelationships: relationships.filter(
        (row) => row.riskScore >= settings.riskReview,
      ).length,
      hodAssignedEditionCountries: hodEditionCoverage.size,
      hodUnknownEditionCountries: unknownHodEditionCoverage.size,
    };

    const durationMs = Date.now() - startedAt;
    return {
      stats,
      signals,
      relationships,
      filters: {
        lens,
        channel,
        hodPersonId: options.hodPersonId ?? null,
        editionId: options.editionId ?? null,
        people: canonical.hod.people,
        editions: canonical.hod.editions
          .map((edition: any) => ({
            id: String(edition.id),
            name: String(edition.name),
            editionNumber:
              edition.edition_number == null
                ? null
                : Number(edition.edition_number),
          }))
          .sort(
            (a: any, b: any) =>
              Number(b.editionNumber ?? 0) -
              Number(a.editionNumber ?? 0),
          ),
      },
      historyWeighting: {
        modelVersion: FRIEND_VOTING_MODEL_VERSION,
        editionDecay: settings.advancedModel.editionDecay ?? 0.88,
        fourEditionsAgoWeight: recentEditionWeight(
          4,
          settings.advancedModel.editionDecay,
        ),
        lifetimeFloor: settings.advancedModel.lifetimeFloor ?? 0.15,
        recentShare: settings.advancedModel.recentHistoryShare ?? 0.75,
        lifetimeShare: settings.advancedModel.lifetimeHistoryShare ?? 0.25,
        scopedThroughEditionNumber: selectedEditionNumber,
      },
      diagnostics: {
        requestId,
        engineVersion: FRIEND_VOTING_ENGINE_VERSION,
        modelVersion: FRIEND_VOTING_MODEL_VERSION,
        durationMs,
        historicalObservations: historicalObservations.length,
        scopedObservations: pairScope.length,
        relationships: relationships.length,
        normalizedCrossScaleScores: true,
        historicalSourcesIncluded: true,
      },
    };
  } catch (error) {
    throw scopeError(stage, requestId, error);
  }
}
