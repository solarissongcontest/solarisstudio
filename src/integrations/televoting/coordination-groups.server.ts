import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { loadCanonicalVotingContextServer, canonicalEditionForRound } from "@/integrations/televoting/canonical-context.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import { detectCoordinationGroups, type CoordinationEdge } from "@/integrations/televoting/coordination-groups";
import { calculateFriendVotingRisk } from "@/integrations/televoting/friend-voting-math";
import type { FriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.server";
import type { IntelligenceOptions } from "@/integrations/televoting/intelligence.server";

type Observation = {
  sourcePersonId: string;
  sourceName: string;
  targetPersonId: string;
  targetName: string;
  editionId: string;
  channel: "jury" | "televote";
  score: number;
  maxScore: number;
  supported: boolean;
  maximum: boolean;
  normalized: number;
};

type EdgeAccumulator = {
  sourcePersonId: string;
  sourceName: string;
  targetPersonId: string;
  targetName: string;
  editions: Set<string>;
  supportEditions: Set<string>;
  maximumEditions: Set<string>;
  channelsByEdition: Map<string, Set<string>>;
  normalizedByEdition: Map<string, { total: number; count: number }>;
  reciprocalComparableEditions: Set<string>;
  reciprocalSupportEditions: Set<string>;
  opportunities: number;
};

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

export async function getCoordinationGroupsServer(
  options: IntelligenceOptions,
  settings: FriendVotingSettings,
) {
  await requireMergedTelevotingAdminServer();
  const canonical = await loadCanonicalVotingContextServer();
  const delegationController = defaultControllerMap(canonical);

  const resolveTarget = (editionId: string, countryId: string, channel: "jury" | "televote") => {
    const direct = delegationController.get(`${editionId}:${countryId}`);
    if (direct) return direct;
    const fallback = canonical.hod.resolve(editionId, countryId, channel);
    return fallback ? { personId: fallback.personId, displayName: fallback.displayName } : null;
  };

  const [roundResult, roundEntryResult, submissionResult] = await Promise.all([
    televotingAdmin.from("rounds").select("id,edition_id"),
    televotingAdmin.from("round_entries").select("round_id,entry_key,country_code"),
    televotingAdmin
      .from("vote_submissions")
      .select("id,round_id,country_code,status")
      .neq("status", "deleted")
      .limit(50000),
  ]);
  if (roundResult.error) throw new Error(roundResult.error.message);
  if (roundEntryResult.error) throw new Error(roundEntryResult.error.message);
  if (submissionResult.error) throw new Error(submissionResult.error.message);

  const rounds = roundResult.data ?? [];
  const canonicalEditionByRound = new Map<string, string>();
  for (const round of rounds) {
    const editionId = canonicalEditionForRound(canonical, { id: String(round.id), edition_id: String(round.edition_id) });
    if (editionId) canonicalEditionByRound.set(String(round.id), editionId);
  }

  const participantsByRound = new Map<string, Set<string>>();
  for (const entry of roundEntryResult.data ?? []) {
    const code = String(entry.country_code || entry.entry_key || "").trim().toUpperCase();
    if (!code) continue;
    const set = participantsByRound.get(String(entry.round_id)) ?? new Set<string>();
    set.add(code);
    participantsByRound.set(String(entry.round_id), set);
  }

  const submissions = (submissionResult.data ?? []).filter((submission) => {
    const editionId = canonicalEditionByRound.get(String(submission.round_id));
    if (!editionId) return false;
    if (options.editionId && editionId !== options.editionId) return false;
    const sourceCountry = canonical.hod.countriesByCode.get(String(submission.country_code ?? "").trim().toUpperCase()) as any;
    if (!sourceCountry?.id) return false;
    const sourceHod = canonical.hod.resolve(editionId, String(sourceCountry.id), "televote");
    if (!sourceHod) return false;
    return !options.hodPersonId || sourceHod.personId === options.hodPersonId;
  });

  const submissionIds = submissions.map((submission) => String(submission.id));
  const voteEntryResult = submissionIds.length
    ? await televotingAdmin.from("vote_entries").select("submission_id,target_country_code,points").in("submission_id", submissionIds).limit(250000)
    : { data: [], error: null };
  if (voteEntryResult.error) throw new Error(voteEntryResult.error.message);
  const voteEntriesBySubmission = new Map<string, Map<string, number>>();
  for (const entry of voteEntryResult.data ?? []) {
    const submissionId = String(entry.submission_id);
    const points = voteEntriesBySubmission.get(submissionId) ?? new Map<string, number>();
    points.set(String(entry.target_country_code ?? "").trim().toUpperCase(), Number(entry.points ?? 0));
    voteEntriesBySubmission.set(submissionId, points);
  }

  const observations: Observation[] = [];
  if (options.channel !== "jury") {
    for (const submission of submissions) {
      const roundId = String(submission.round_id);
      const editionId = canonicalEditionByRound.get(roundId);
      if (!editionId) continue;
      const sourceCode = String(submission.country_code ?? "").trim().toUpperCase();
      const sourceCountry = canonical.hod.countriesByCode.get(sourceCode) as any;
      const sourceHod = canonical.hod.resolve(editionId, String(sourceCountry?.id ?? ""), "televote");
      if (!sourceHod) continue;
      const points = voteEntriesBySubmission.get(String(submission.id)) ?? new Map<string, number>();
      const maxScore = Math.max(0, ...points.values());
      for (const targetCode of participantsByRound.get(roundId) ?? []) {
        if (targetCode === sourceCode) continue;
        const targetCountry = canonical.hod.countriesByCode.get(targetCode) as any;
        if (!targetCountry?.id) continue;
        const targetHod = resolveTarget(editionId, String(targetCountry.id), "televote");
        if (!targetHod || targetHod.personId === sourceHod.personId) continue;
        const score = points.get(targetCode) ?? 0;
        observations.push({
          sourcePersonId: sourceHod.personId,
          sourceName: sourceHod.displayName,
          targetPersonId: targetHod.personId,
          targetName: targetHod.displayName,
          editionId,
          channel: "televote",
          score,
          maxScore,
          supported: score > 0,
          maximum: score > 0 && score === maxScore,
          normalized: maxScore > 0 ? score / maxScore : 0,
        });
      }
    }
  }

  if (options.channel !== "televote") {
    const juryVotes = canonical.juryVotes.filter((vote) => {
      if (!vote.voter_country_id) return false;
      if (options.editionId && String(vote.edition_id) !== options.editionId) return false;
      const sourceHod = canonical.hod.resolve(String(vote.edition_id), String(vote.voter_country_id), "jury");
      if (!sourceHod) return false;
      return !options.hodPersonId || sourceHod.personId === options.hodPersonId;
    });
    const byBallot = new Map<string, typeof juryVotes>();
    for (const vote of juryVotes) {
      const key = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
      const list = byBallot.get(key) ?? [];
      list.push(vote);
      byBallot.set(key, list);
    }
    for (const ballot of byBallot.values()) {
      const first = ballot[0];
      if (!first?.voter_country_id) continue;
      const editionId = String(first.edition_id);
      const sourceHod = canonical.hod.resolve(editionId, String(first.voter_country_id), "jury");
      if (!sourceHod) continue;
      const scoreByCountryId = new Map<string, number>();
      for (const vote of ballot) {
        if (vote.receiving_country_id) scoreByCountryId.set(String(vote.receiving_country_id), Number(vote.points ?? 0));
      }
      const maxScore = Math.max(0, ...scoreByCountryId.values());
      const participants = first.show_id
        ? canonical.participantsByShow.get(String(first.show_id)) ?? new Set<string>()
        : canonical.editionParticipants.get(editionId) ?? new Set<string>();
      for (const targetCountryId of participants) {
        if (targetCountryId === first.voter_country_id) continue;
        const targetHod = resolveTarget(editionId, String(targetCountryId), "jury");
        if (!targetHod || targetHod.personId === sourceHod.personId) continue;
        const score = scoreByCountryId.get(String(targetCountryId)) ?? 0;
        observations.push({
          sourcePersonId: sourceHod.personId,
          sourceName: sourceHod.displayName,
          targetPersonId: targetHod.personId,
          targetName: targetHod.displayName,
          editionId,
          channel: "jury",
          score,
          maxScore,
          supported: score > 0,
          maximum: score > 0 && score === maxScore,
          normalized: maxScore > 0 ? score / maxScore : 0,
        });
      }
    }
  }

  const lookup = new Map<string, Observation[]>();
  for (const observation of observations) {
    const key = `${observation.editionId}:${observation.channel}:${observation.sourcePersonId}:${observation.targetPersonId}`;
    const list = lookup.get(key) ?? [];
    list.push(observation);
    lookup.set(key, list);
  }

  const accumulators = new Map<string, EdgeAccumulator>();
  for (const observation of observations) {
    const key = `${observation.sourcePersonId}\u0000${observation.targetPersonId}`;
    const current = accumulators.get(key) ?? {
      sourcePersonId: observation.sourcePersonId,
      sourceName: observation.sourceName,
      targetPersonId: observation.targetPersonId,
      targetName: observation.targetName,
      editions: new Set<string>(),
      supportEditions: new Set<string>(),
      maximumEditions: new Set<string>(),
      channelsByEdition: new Map<string, Set<string>>(),
      normalizedByEdition: new Map<string, { total: number; count: number }>(),
      reciprocalComparableEditions: new Set<string>(),
      reciprocalSupportEditions: new Set<string>(),
      opportunities: 0,
    };
    current.editions.add(observation.editionId);
    current.opportunities += 1;
    if (observation.supported) {
      current.supportEditions.add(observation.editionId);
      const channels = current.channelsByEdition.get(observation.editionId) ?? new Set<string>();
      channels.add(observation.channel);
      current.channelsByEdition.set(observation.editionId, channels);
    }
    if (observation.maximum) current.maximumEditions.add(observation.editionId);
    const normalized = current.normalizedByEdition.get(observation.editionId) ?? { total: 0, count: 0 };
    normalized.total += observation.normalized;
    normalized.count += 1;
    current.normalizedByEdition.set(observation.editionId, normalized);

    const reverseKey = `${observation.editionId}:${observation.channel}:${observation.targetPersonId}:${observation.sourcePersonId}`;
    const reverse = lookup.get(reverseKey);
    if (reverse?.length) {
      current.reciprocalComparableEditions.add(observation.editionId);
      if (observation.supported && reverse.some((candidate) => candidate.supported)) {
        current.reciprocalSupportEditions.add(observation.editionId);
      }
    }
    accumulators.set(key, current);
  }

  const edges: CoordinationEdge[] = [...accumulators.values()].map((value) => {
    const uniqueEditions = value.editions.size;
    const supportFrequency = uniqueEditions ? value.supportEditions.size / uniqueEditions : 0;
    const maximumFrequency = uniqueEditions ? value.maximumEditions.size / uniqueEditions : 0;
    const normalizedValues = [...value.normalizedByEdition.values()].map((row) => row.count ? row.total / row.count : 0);
    const normalizedAverage = normalizedValues.length ? normalizedValues.reduce((sum, score) => sum + score, 0) / normalizedValues.length : 0;
    const reciprocalSupport = value.reciprocalComparableEditions.size
      ? value.reciprocalSupportEditions.size / value.reciprocalComparableEditions.size
      : 0;
    const crossChannelEditions = [...value.channelsByEdition.values()].filter((channels) => channels.has("jury") && channels.has("televote")).length;
    const risk = calculateFriendVotingRisk({
      uniqueEditions,
      opportunities: value.opportunities,
      supportFrequency,
      maximumFrequency,
      reciprocalSupport,
      normalizedAverage,
      crossChannelEditions,
    }, settings);
    return {
      sourcePersonId: value.sourcePersonId,
      sourceName: value.sourceName,
      targetPersonId: value.targetPersonId,
      targetName: value.targetName,
      riskScore: risk.riskScore,
      confidence: risk.confidence,
      uniqueEditions,
      supportEditions: value.supportEditions.size,
      opportunityEditions: uniqueEditions,
      reciprocalSupport: Math.round(reciprocalSupport * 1000) / 10,
      crossChannelEditions,
    };
  });

  const groups = detectCoordinationGroups(edges, {
    minEdgeRisk: settings.cliqueMinEdgeRisk,
    minMembers: settings.cliqueMinMembers,
    minDensity: settings.cliqueMinDensity,
    internalShareThreshold: settings.cliqueInternalShareThreshold,
  });

  return {
    groups,
    edges: edges.sort((a, b) => b.riskScore - a.riskScore).slice(0, 500),
    stats: {
      knownControllerObservations: observations.length,
      knownControllerEdges: edges.length,
      qualifiedEdges: edges.filter((edge) => edge.riskScore >= settings.cliqueMinEdgeRisk).length,
      groups: groups.length,
    },
  };
}
