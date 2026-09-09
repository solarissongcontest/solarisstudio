import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import {
  calculateAdvancedFriendVotingRisk,
  type AdvancedFriendVotingObservation,
} from "@/integrations/televoting/advanced-friend-voting";
import {
  canonicalEditionForRound,
  loadCanonicalVotingContextServer,
} from "@/integrations/televoting/canonical-context.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import { detectCoordinationGroups, type CoordinationEdge } from "@/integrations/televoting/coordination-groups";
import type { FriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.server";
import { recentEditionWeight } from "@/integrations/televoting/history-weighting";
import type { IntelligenceOptions } from "@/integrations/televoting/intelligence.server";

type Observation = {
  sourcePersonId: string;
  sourceName: string;
  targetPersonId: string;
  targetName: string;
  editionId: string;
  editionNumber: number | null;
  channel: "jury" | "televote";
  score: number;
  maxScore: number;
  supported: boolean;
  maximum: boolean;
  rank: number | null;
  participantCount: number;
};

type ReverseIndex = Map<string, Observation[]>;

const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();
const reverseKey = (
  editionId: string,
  channel: Observation["channel"],
  sourcePersonId: string,
  targetPersonId: string,
) => `${editionId}\u0000${channel}\u0000${sourcePersonId}\u0000${targetPersonId}`;

function ranks(rows: Array<{ target: string; score: number }>) {
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

function defaultControllerMap(context: Awaited<ReturnType<typeof loadCanonicalVotingContextServer>>) {
  const map = new Map<string, { personId: string; displayName: string }>();
  for (const assignment of context.hod.assignments) {
    if (assignment.channel !== "delegation") continue;
    const person = context.hod.peopleById.get(assignment.person_id);
    if (!person) continue;
    map.set(`${assignment.edition_id}:${assignment.country_id}`, {
      personId: person.id,
      displayName: person.display_name,
    });
  }
  return map;
}

function advanced(row: Observation): AdvancedFriendVotingObservation {
  return {
    editionId: row.editionId,
    editionNumber: row.editionNumber,
    channel: row.channel,
    voterId: row.sourcePersonId,
    targetCode: row.targetPersonId,
    score: row.score,
    maxScore: row.maxScore,
    supported: row.supported,
    maximum: row.maximum,
    rank: row.rank,
    participantCount: row.participantCount,
  };
}

function currentEditionNumber(observations: Observation[]) {
  const values = observations
    .map((row) => row.editionNumber)
    .filter((value): value is number => value != null && Number.isFinite(value));
  return values.length ? Math.max(...values) : null;
}

function editionWeight(row: Observation, current: number | null) {
  if (current == null || row.editionNumber == null) return 1;
  return recentEditionWeight(Math.max(0, current - row.editionNumber));
}

function buildReverseIndex(observations: Observation[]) {
  const index: ReverseIndex = new Map();
  for (const row of observations) {
    const key = reverseKey(
      row.editionId,
      row.channel,
      row.sourcePersonId,
      row.targetPersonId,
    );
    const list = index.get(key) ?? [];
    list.push(row);
    index.set(key, list);
  }
  return index;
}

export async function getCoordinationGroupsV4Server(
  options: IntelligenceOptions,
  settings: FriendVotingSettings,
) {
  await requireMergedTelevotingAdminServer();
  const canonical = await loadCanonicalVotingContextServer();
  const delegationController = defaultControllerMap(canonical);
  const editionNumber = (id: string) => {
    const row = canonical.hod.editionsById.get(id) as any;
    return row?.edition_number == null ? null : Number(row.edition_number);
  };
  const resolveTarget = (editionId: string, countryId: string, channel: "jury" | "televote") => {
    const direct = delegationController.get(`${editionId}:${countryId}`);
    if (direct) return direct;
    const fallback = canonical.hod.resolve(editionId, countryId, channel);
    return fallback ? { personId: fallback.personId, displayName: fallback.displayName } : null;
  };

  const [roundResult, roundEntryResult, submissionResult] = await Promise.all([
    televotingAdmin.from("rounds").select("id,edition_id"),
    televotingAdmin.from("round_entries").select("round_id,entry_key,country_code"),
    televotingAdmin.from("vote_submissions").select("id,round_id,country_code,status").limit(50000),
  ]);
  for (const result of [roundResult, roundEntryResult, submissionResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const canonicalEditionByRound = new Map<string, string>();
  for (const row of roundResult.data ?? []) {
    const id = canonicalEditionForRound(canonical, {
      id: String(row.id),
      edition_id: String(row.edition_id),
    });
    if (id) canonicalEditionByRound.set(String(row.id), id);
  }

  const entryCountry = new Map<string, string>();
  const participantCodesByRound = new Map<string, Set<string>>();
  for (const row of roundEntryResult.data ?? []) {
    const code = upper(row.country_code || row.entry_key);
    if (!code) continue;
    entryCountry.set(`${row.round_id}:${row.entry_key}`, code);
    const set = participantCodesByRound.get(String(row.round_id)) ?? new Set<string>();
    set.add(code);
    participantCodesByRound.set(String(row.round_id), set);
  }

  const submissions = (submissionResult.data ?? []).filter((row) => {
    if (row.status === "deleted") return false;
    const editionId = canonicalEditionByRound.get(String(row.round_id));
    if (!editionId) return false;
    if (options.editionId && editionId !== options.editionId) return false;
    const sourceCountry = canonical.hod.countriesByCode.get(upper(row.country_code)) as any;
    const source = sourceCountry?.id
      ? canonical.hod.resolve(editionId, String(sourceCountry.id), "televote")
      : null;
    return Boolean(source && (!options.hodPersonId || source.personId === options.hodPersonId));
  });

  const submissionRound = new Map(
    submissions.map((submission) => [String(submission.id), String(submission.round_id)]),
  );
  const ids = [...submissionRound.keys()];
  const voteEntryResult = ids.length
    ? await televotingAdmin
        .from("vote_entries")
        .select("submission_id,target_country_code,points")
        .in("submission_id", ids)
        .limit(250000)
    : { data: [], error: null };
  if (voteEntryResult.error) throw new Error(voteEntryResult.error.message);

  const entriesBySubmission = new Map<string, Map<string, number>>();
  for (const row of voteEntryResult.data ?? []) {
    const submissionId = String(row.submission_id);
    const map = entriesBySubmission.get(submissionId) ?? new Map<string, number>();
    const roundId = submissionRound.get(submissionId);
    const code =
      (roundId
        ? entryCountry.get(`${roundId}:${row.target_country_code}`)
        : null) ?? upper(row.target_country_code);
    map.set(code, Number(row.points ?? 0));
    entriesBySubmission.set(submissionId, map);
  }

  const observations: Observation[] = [];
  if (options.channel !== "jury") {
    for (const submission of submissions) {
      const roundId = String(submission.round_id);
      const editionId = canonicalEditionByRound.get(roundId);
      if (!editionId) continue;
      const sourceCode = upper(submission.country_code);
      const sourceCountry = canonical.hod.countriesByCode.get(sourceCode) as any;
      const source = sourceCountry?.id
        ? canonical.hod.resolve(editionId, String(sourceCountry.id), "televote")
        : null;
      if (!source) continue;

      const scores = entriesBySubmission.get(String(submission.id)) ?? new Map<string, number>();
      const targets = [...(participantCodesByRound.get(roundId) ?? new Set<string>())]
        .filter((code) => code !== sourceCode);
      const scoreRows: Array<{
        target: string;
        score: number;
        targetPersonId: string;
        targetName: string;
      }> = [];

      for (const targetCode of targets) {
        const targetCountry = canonical.hod.countriesByCode.get(targetCode) as any;
        if (!targetCountry?.id) continue;
        const target = resolveTarget(editionId, String(targetCountry.id), "televote");
        if (!target || target.personId === source.personId) continue;
        scoreRows.push({
          target: target.personId,
          score: scores.get(targetCode) ?? 0,
          targetPersonId: target.personId,
          targetName: target.displayName,
        });
      }

      const rankMap = ranks(scoreRows);
      const maxScore = Math.max(0, ...scoreRows.map((row) => row.score));
      for (const row of scoreRows) {
        observations.push({
          sourcePersonId: source.personId,
          sourceName: source.displayName,
          targetPersonId: row.targetPersonId,
          targetName: row.targetName,
          editionId,
          editionNumber: editionNumber(editionId),
          channel: "televote",
          score: row.score,
          maxScore,
          supported: row.score > 0,
          maximum: row.score > 0 && row.score === maxScore,
          rank: rankMap.get(row.targetPersonId) ?? null,
          participantCount: scoreRows.length,
        });
      }
    }
  }

  if (options.channel !== "televote") {
    const filtered = canonical.juryVotes.filter((vote) => {
      if (!vote.voter_country_id) return false;
      if (options.editionId && String(vote.edition_id) !== options.editionId) return false;
      const source = canonical.hod.resolve(
        String(vote.edition_id),
        String(vote.voter_country_id),
        "jury",
      );
      return Boolean(source && (!options.hodPersonId || source.personId === options.hodPersonId));
    });

    const byBallot = new Map<string, typeof filtered>();
    for (const vote of filtered) {
      const key = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
      const list = byBallot.get(key) ?? [];
      list.push(vote);
      byBallot.set(key, list);
    }

    for (const ballot of byBallot.values()) {
      const first = ballot[0];
      if (!first?.voter_country_id) continue;
      const editionId = String(first.edition_id);
      const source = canonical.hod.resolve(editionId, String(first.voter_country_id), "jury");
      if (!source) continue;

      const scores = new Map(
        ballot
          .filter((vote) => vote.receiving_country_id)
          .map((vote) => [String(vote.receiving_country_id), Number(vote.points ?? 0)]),
      );
      const participants = first.show_id
        ? canonical.participantsByShow.get(String(first.show_id)) ?? new Set<string>()
        : canonical.editionParticipants.get(editionId) ?? new Set<string>();
      const scoreRows: Array<{ target: string; score: number; targetName: string }> = [];

      for (const targetCountryId of participants) {
        if (targetCountryId === first.voter_country_id) continue;
        const target = resolveTarget(editionId, targetCountryId, "jury");
        if (!target || target.personId === source.personId) continue;
        scoreRows.push({
          target: target.personId,
          score: scores.get(targetCountryId) ?? 0,
          targetName: target.displayName,
        });
      }

      const rankMap = ranks(scoreRows);
      const maxScore = Math.max(0, ...scoreRows.map((row) => row.score));
      for (const row of scoreRows) {
        observations.push({
          sourcePersonId: source.personId,
          sourceName: source.displayName,
          targetPersonId: row.target,
          targetName: row.targetName,
          editionId,
          editionNumber: editionNumber(editionId),
          channel: "jury",
          score: row.score,
          maxScore,
          supported: row.score > 0,
          maximum: row.score > 0 && row.score === maxScore,
          rank: rankMap.get(row.target) ?? null,
          participantCount: scoreRows.length,
        });
      }
    }
  }

  const current = currentEditionNumber(observations);
  const advancedAll = observations.map(advanced);
  const byPair = new Map<string, Observation[]>();
  for (const row of observations) {
    const key = `${row.sourcePersonId}\u0000${row.targetPersonId}`;
    const list = byPair.get(key) ?? [];
    list.push(row);
    byPair.set(key, list);
  }
  const reverseIndex = buildReverseIndex(observations);

  const edges: CoordinationEdge[] = [];
  for (const pair of byPair.values()) {
    const first = pair[0]!;
    const reciprocalEditions = new Map<string, { weight: number; reciprocal: boolean }>();

    for (const row of pair) {
      const reverse = reverseIndex.get(
        reverseKey(
          row.editionId,
          row.channel,
          row.targetPersonId,
          row.sourcePersonId,
        ),
      ) ?? [];
      if (!reverse.length) continue;
      const item = reciprocalEditions.get(row.editionId) ?? {
        weight: editionWeight(row, current),
        reciprocal: false,
      };
      if (row.supported && reverse.some((candidate) => candidate.supported)) {
        item.reciprocal = true;
      }
      reciprocalEditions.set(row.editionId, item);
    }

    const reciprocalRows = [...reciprocalEditions.values()];
    const reciprocalWeight = reciprocalRows.reduce((sum, row) => sum + row.weight, 0);
    const reciprocalSupport = reciprocalWeight
      ? reciprocalRows
          .filter((row) => row.reciprocal)
          .reduce((sum, row) => sum + row.weight, 0) / reciprocalWeight
      : 0;

    const result = calculateAdvancedFriendVotingRisk(
      pair.map(advanced),
      advancedAll,
      reciprocalSupport,
      reciprocalRows.length,
      null,
      settings.advancedModel,
    );
    const editions = new Set(pair.map((row) => row.editionId));
    const supportedByEdition = new Map<string, number>();
    for (const row of pair.filter((item) => item.supported)) {
      supportedByEdition.set(
        row.editionId,
        Math.max(supportedByEdition.get(row.editionId) ?? 0, editionWeight(row, current)),
      );
    }

    edges.push({
      sourcePersonId: first.sourcePersonId,
      sourceName: first.sourceName,
      targetPersonId: first.targetPersonId,
      targetName: first.targetName,
      riskScore: result.overallRisk,
      confidence: result.confidence,
      uniqueEditions: editions.size,
      supportEditions: [...supportedByEdition.values()].reduce((sum, value) => sum + value, 0),
      opportunityEditions: result.sampleSize.effectiveRecentEditions,
      reciprocalSupport: Math.round(reciprocalSupport * 1000) / 10,
      crossChannelEditions: result.evidence.crossChannelEditions,
    });
  }

  const groups = detectCoordinationGroups(edges, {
    minEdgeRisk: settings.cliqueMinEdgeRisk,
    minMembers: settings.cliqueMinMembers,
    minDensity: settings.cliqueMinDensity,
    internalShareThreshold: settings.cliqueInternalShareThreshold,
  });

  return {
    groups,
    edges: edges
      .sort((a, b) => b.riskScore - a.riskScore || b.confidence - a.confidence)
      .slice(0, 500),
    stats: {
      modelVersion: "friend-voting-model-v4",
      editionDecay: 0.88,
      knownControllerObservations: observations.length,
      knownControllerEdges: edges.length,
      qualifiedEdges: edges.filter((edge) => edge.riskScore >= settings.cliqueMinEdgeRisk).length,
      groups: groups.length,
    },
  };
}
