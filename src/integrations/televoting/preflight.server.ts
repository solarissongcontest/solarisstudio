import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canonicalEditionForRound, loadCanonicalVotingContextServer } from "@/integrations/televoting/canonical-context.server";
import { calculateFriendVotingRisk } from "@/integrations/televoting/friend-voting-math";
import { loadFriendVotingSettingsServer } from "@/integrations/televoting/friend-voting-settings.server";
import {
  VOTE_INTEGRITY_ATTESTATION,
  VOTE_INTEGRITY_CONSEQUENCE,
  VOTE_INTEGRITY_STATEMENT_VERSION,
  type VoteIntegrityFinding,
  type VoteIntegrityReport,
  type VoteIntegritySeverity,
  type VoteIntegrityTechnicalSignal,
} from "@/integrations/televoting/integrity";
import { getTelevotingNetworkSignals } from "@/integrations/televoting/network.server";
import { enforceTelevotingRateLimit } from "@/integrations/televoting/rate-limit.server";

export type VotePreflightInput = {
  roundId: string;
  username: string;
  countryCode: string;
  entries: Array<{ target_country_code: string; points: number }>;
  fingerprintHash?: string | null;
  deviceTokenHash?: string | null;
};

type RoundRow = { id: string; edition_id: string; name: string; status: string };
type SubmissionRow = {
  id: string;
  round_id: string;
  country_code: string;
  ip_hash: string | null;
  status: string | null;
  deletion_category: string | null;
  created_at: string;
};
type VoteEntryRow = { submission_id: string; target_country_code: string; points: number };
type RoundEntryRow = { round_id: string; entry_key: string; country_code: string | null };
type Observation = {
  editionId: string;
  channel: "televote" | "jury";
  voterCode: string;
  voterCountryId: string | null;
  hodPersonId: string | null;
  targetCode: string;
  score: number;
  maxScore: number;
  supported: boolean;
  maximum: boolean;
  normalized: number;
};

const ignoredDeletedCategories = new Set([
  "test_submission",
  "administrative_error",
  "wrong_voting_country",
]);

function upper(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function shouldUseSubmission(row: SubmissionRow) {
  if (row.status !== "deleted") return true;
  return !ignoredDeletedCategories.has(String(row.deletion_category ?? "").toLowerCase());
}

function pct(value: number) {
  return Math.round(value * 1000) / 10;
}

function severityForRisk(risk: number, settings: Awaited<ReturnType<typeof loadFriendVotingSettingsServer>>): VoteIntegritySeverity {
  if (risk >= settings.riskCritical) return "critical";
  if (risk >= settings.riskHigh) return "high";
  if (risk >= settings.riskStrong) return "strong";
  if (risk >= settings.riskReview) return "review";
  if (risk >= settings.riskNotable) return "notable";
  return "none";
}

function ballotMap(entries: VotePreflightInput["entries"]) {
  return Object.fromEntries(entries.map((entry) => [entry.target_country_code, entry.points]));
}

function relationshipFinding(
  observations: Observation[],
  allObservations: Observation[],
  targetCode: string,
  lens: "hod" | "country",
  currentCountryCode: string,
  currentHodPersonId: string | null,
  targetName: string,
  settings: Awaited<ReturnType<typeof loadFriendVotingSettingsServer>>,
): VoteIntegrityFinding | null {
  const pair = observations.filter((observation) => observation.targetCode === targetCode);
  if (!pair.length) return null;

  const editions = new Set(pair.map((observation) => observation.editionId));
  const supportChannels = new Map<string, Set<string>>();
  const maximumEditions = new Set<string>();
  const normalizedByEdition = new Map<string, { total: number; count: number }>();
  const reciprocalByEdition = new Map<string, { opportunities: number; supported: boolean }>();

  for (const observation of pair) {
    if (observation.supported) {
      const channels = supportChannels.get(observation.editionId) ?? new Set<string>();
      channels.add(observation.channel);
      supportChannels.set(observation.editionId, channels);
    }
    if (observation.maximum) maximumEditions.add(observation.editionId);

    const normalized = normalizedByEdition.get(observation.editionId) ?? { total: 0, count: 0 };
    normalized.total += observation.normalized;
    normalized.count += 1;
    normalizedByEdition.set(observation.editionId, normalized);

    const reverse = allObservations.filter(
      (candidate) =>
        candidate.editionId === observation.editionId &&
        candidate.channel === observation.channel &&
        candidate.voterCode === targetCode &&
        candidate.targetCode === observation.voterCode,
    );
    if (reverse.length) {
      const reciprocal = reciprocalByEdition.get(observation.editionId) ?? { opportunities: 0, supported: false };
      reciprocal.opportunities += 1;
      if (observation.supported && reverse.some((candidate) => candidate.supported)) reciprocal.supported = true;
      reciprocalByEdition.set(observation.editionId, reciprocal);
    }
  }

  const uniqueEditions = editions.size;
  const supportFrequency = uniqueEditions ? supportChannels.size / uniqueEditions : 0;
  const maximumFrequency = uniqueEditions ? maximumEditions.size / uniqueEditions : 0;
  const normalizedEditionAverages = [...normalizedByEdition.values()].map((row) =>
    row.count ? row.total / row.count : 0,
  );
  const normalizedAverage = normalizedEditionAverages.length
    ? normalizedEditionAverages.reduce((sum, value) => sum + value, 0) / normalizedEditionAverages.length
    : 0;
  const reciprocalEditions = [...reciprocalByEdition.values()].filter((row) => row.opportunities > 0);
  const reciprocalSupport = reciprocalEditions.length
    ? reciprocalEditions.filter((row) => row.supported).length / reciprocalEditions.length
    : 0;
  const crossChannelEditions = [...supportChannels.values()].filter(
    (channels) => channels.has("jury") && channels.has("televote"),
  ).length;

  const risk = calculateFriendVotingRisk(
    {
      uniqueEditions,
      opportunities: pair.length,
      supportFrequency,
      maximumFrequency,
      reciprocalSupport,
      normalizedAverage,
      crossChannelEditions,
    },
    settings,
  );

  return {
    targetCode,
    targetName,
    lens,
    scopeLabel: lens === "hod"
      ? "Your HOD history across the countries/editions you controlled"
      : `Historical voting from ${currentCountryCode}`,
    riskScore: risk.riskScore,
    confidence: risk.confidence,
    uniqueEditions,
    supportFrequency: pct(supportFrequency),
    maximumFrequency: pct(maximumFrequency),
    reciprocalSupport: pct(reciprocalSupport),
    crossChannelEditions,
    reasons: risk.reasons,
  };
}

export async function runVoteIntegrityPreflightServer(input: VotePreflightInput): Promise<VoteIntegrityReport> {
  const network = getTelevotingNetworkSignals();
  enforceTelevotingRateLimit(`vote-preflight:${network.ipHash ?? input.deviceTokenHash ?? "anon"}`, {
    limit: 12,
    windowMs: 60_000,
    message: "Too many ballot checks from this connection. Please wait a moment.",
  });

  const username = input.username.trim();
  const countryCode = upper(input.countryCode);
  if (!input.roundId || username.length < 2 || !countryCode) throw new Error("Ballot identity is incomplete");

  const canonical = await loadCanonicalVotingContextServer();
  const settings = await loadFriendVotingSettingsServer();
  const tv = (supabaseAdmin as any).schema("televoting");

  const [roundsResult, submissionsResult, voteEntriesResult, roundEntriesResult, tvCountriesResult] = await Promise.all([
    tv.from("rounds").select("id,edition_id,name,status").order("created_at", { ascending: true }),
    tv.from("vote_submissions").select("id,round_id,country_code,ip_hash,status,deletion_category,created_at").order("created_at", { ascending: true }).limit(50000),
    tv.from("vote_entries").select("submission_id,target_country_code,points").limit(250000),
    tv.from("round_entries").select("round_id,entry_key,country_code"),
    tv.from("countries").select("code,name"),
  ]);

  for (const result of [roundsResult, submissionsResult, voteEntriesResult, roundEntriesResult, tvCountriesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const rounds = (roundsResult.data ?? []) as RoundRow[];
  const currentRound = rounds.find((round) => round.id === input.roundId);
  if (!currentRound) throw new Error("Voting round not found");
  if (currentRound.status !== "open") throw new Error("Voting round is not open");

  const canonicalEditionId = canonicalEditionForRound(canonical, currentRound);
  const currentCountry = canonical.hod.countriesByCode.get(countryCode) as any;
  const currentCountryId = currentCountry?.id ? String(currentCountry.id) : null;
  const currentHod = canonical.hod.resolve(canonicalEditionId, currentCountryId, "televote");

  const countryName = new Map<string, string>();
  for (const row of tvCountriesResult.data ?? []) countryName.set(upper((row as any).code), String((row as any).name));
  for (const country of canonical.hod.countries) {
    const code = upper((country as any).short_code);
    if (code) countryName.set(code, String((country as any).name));
  }

  const canonicalEditionByRound = new Map<string, string>();
  for (const round of rounds) {
    const id = canonicalEditionForRound(canonical, round);
    if (id) canonicalEditionByRound.set(round.id, id);
  }

  const roundEntryRows = (roundEntriesResult.data ?? []) as RoundEntryRow[];
  const roundEntryCountry = new Map<string, string>();
  const participantsByRound = new Map<string, Set<string>>();
  for (const row of roundEntryRows) {
    const code = upper(row.country_code);
    if (code) {
      roundEntryCountry.set(`${row.round_id}:${row.entry_key}`, code);
      const participants = participantsByRound.get(row.round_id) ?? new Set<string>();
      participants.add(code);
      participantsByRound.set(row.round_id, participants);
    }
  }

  const voteEntriesBySubmission = new Map<string, VoteEntryRow[]>();
  for (const entry of (voteEntriesResult.data ?? []) as VoteEntryRow[]) {
    const list = voteEntriesBySubmission.get(entry.submission_id) ?? [];
    list.push(entry);
    voteEntriesBySubmission.set(entry.submission_id, list);
  }

  const allObservations: Observation[] = [];
  const usableSubmissions = ((submissionsResult.data ?? []) as SubmissionRow[]).filter(shouldUseSubmission);
  let historicalTelevoteBallots = 0;
  let historicalJuryBallots = 0;

  for (const submission of usableSubmissions) {
    const editionId = canonicalEditionByRound.get(submission.round_id);
    if (!editionId) continue;
    const voterCode = upper(submission.country_code);
    const voterCountry = canonical.hod.countriesByCode.get(voterCode) as any;
    const voterCountryId = voterCountry?.id ? String(voterCountry.id) : null;
    const hod = canonical.hod.resolve(editionId, voterCountryId, "televote");
    const rawEntries = voteEntriesBySubmission.get(submission.id) ?? [];
    const scoreByTarget = new Map<string, number>();
    let maxScore = 0;
    for (const entry of rawEntries) {
      maxScore = Math.max(maxScore, Number(entry.points || 0));
      const targetCode = roundEntryCountry.get(`${submission.round_id}:${entry.target_country_code}`) ?? upper(entry.target_country_code);
      if (targetCode) scoreByTarget.set(targetCode, Number(entry.points || 0));
    }
    const participants = participantsByRound.get(submission.round_id) ?? new Set<string>();
    if (participants.size) historicalTelevoteBallots += 1;
    for (const targetCode of participants) {
      if (targetCode === voterCode) continue;
      const score = scoreByTarget.get(targetCode) ?? 0;
      allObservations.push({
        editionId,
        channel: "televote",
        voterCode,
        voterCountryId,
        hodPersonId: hod?.personId ?? null,
        targetCode,
        score,
        maxScore,
        supported: score > 0,
        maximum: score > 0 && maxScore > 0 && score === maxScore,
        normalized: maxScore > 0 ? score / maxScore : 0,
      });
    }
  }

  const juryByBallot = new Map<string, typeof canonical.juryVotes>();
  for (const vote of canonical.juryVotes) {
    if (!vote.voter_country_id) continue;
    const key = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
    const list = juryByBallot.get(key) ?? [];
    list.push(vote);
    juryByBallot.set(key, list);
  }

  for (const [, ballotVotes] of juryByBallot) {
    const first = ballotVotes[0];
    if (!first?.voter_country_id) continue;
    const voterCountry = canonical.hod.countriesById.get(first.voter_country_id) as any;
    if (!voterCountry) continue;
    const voterCode = upper(voterCountry.short_code ?? voterCountry.name);
    const hod = canonical.hod.resolve(first.edition_id, first.voter_country_id, "jury");
    const scoreByTarget = new Map<string, number>();
    let maxScore = 0;
    for (const vote of ballotVotes) {
      maxScore = Math.max(maxScore, Number(vote.points ?? 0));
      if (!vote.receiving_country_id) continue;
      const target = canonical.hod.countriesById.get(vote.receiving_country_id) as any;
      if (target) scoreByTarget.set(upper(target.short_code ?? target.name), Number(vote.points ?? 0));
    }
    const participantIds = first.show_id
      ? canonical.participantsByShow.get(String(first.show_id)) ?? new Set<string>()
      : canonical.editionParticipants.get(String(first.edition_id)) ?? new Set<string>();
    if (participantIds.size) historicalJuryBallots += 1;
    for (const targetCountryId of participantIds) {
      if (targetCountryId === first.voter_country_id) continue;
      const target = canonical.hod.countriesById.get(targetCountryId) as any;
      if (!target) continue;
      const targetCode = upper(target.short_code ?? target.name);
      const score = scoreByTarget.get(targetCode) ?? 0;
      allObservations.push({
        editionId: String(first.edition_id),
        channel: "jury",
        voterCode,
        voterCountryId: String(first.voter_country_id),
        hodPersonId: hod?.personId ?? null,
        targetCode,
        score,
        maxScore,
        supported: score > 0,
        maximum: score > 0 && maxScore > 0 && score === maxScore,
        normalized: maxScore > 0 ? score / maxScore : 0,
      });
    }
  }

  const currentEntries = roundEntryRows.filter((row) => row.round_id === input.roundId);
  const currentEntryCode = new Map(currentEntries.map((row) => [row.entry_key, upper(row.country_code)]));
  const proposedByCode = new Map<string, number>();
  const proposedEntryPoints = new Map(input.entries.map((entry) => [entry.target_country_code, Number(entry.points)]));
  const proposedMax = Math.max(0, ...input.entries.map((entry) => Number(entry.points || 0)));
  const currentParticipants = participantsByRound.get(input.roundId) ?? new Set<string>();

  for (const row of currentEntries) {
    const targetCode = currentEntryCode.get(row.entry_key);
    if (!targetCode) continue;
    proposedByCode.set(targetCode, proposedEntryPoints.get(row.entry_key) ?? 0);
  }

  if (canonicalEditionId) {
    for (const targetCode of currentParticipants) {
      if (targetCode === countryCode) continue;
      const score = proposedByCode.get(targetCode) ?? 0;
      allObservations.push({
        editionId: canonicalEditionId,
        channel: "televote",
        voterCode: countryCode,
        voterCountryId: currentCountryId,
        hodPersonId: currentHod?.personId ?? null,
        targetCode,
        score,
        maxScore: proposedMax,
        supported: score > 0,
        maximum: score > 0 && proposedMax > 0 && score === proposedMax,
        normalized: proposedMax > 0 ? score / proposedMax : 0,
      });
    }
  }

  const supportedTargets = [...proposedByCode.entries()].filter(([, points]) => points > 0).map(([code]) => code);
  const findings: VoteIntegrityFinding[] = [];

  for (const targetCode of supportedTargets) {
    const targetName = countryName.get(targetCode) ?? targetCode;
    const countryObservations = allObservations.filter((observation) => observation.voterCode === countryCode);
    const countryFinding = relationshipFinding(
      countryObservations,
      allObservations,
      targetCode,
      "country",
      countryCode,
      currentHod?.personId ?? null,
      targetName,
      settings,
    );
    if (countryFinding) findings.push(countryFinding);

    if (currentHod?.personId) {
      const hodObservations = allObservations.filter((observation) => observation.hodPersonId === currentHod.personId);
      const hodFinding = relationshipFinding(
        hodObservations,
        allObservations,
        targetCode,
        "hod",
        countryCode,
        currentHod.personId,
        targetName,
        settings,
      );
      if (hodFinding) findings.push(hodFinding);
    }
  }

  findings.sort((a, b) => b.riskScore - a.riskScore || b.confidence - a.confidence);
  const relationshipRisk = Math.max(0, ...findings.map((finding) => finding.riskScore));

  const historicalIdentitySubmissions = usableSubmissions
    .map((submission) => {
      const editionId = canonicalEditionByRound.get(submission.round_id);
      const voterCode = upper(submission.country_code);
      const voterCountry = canonical.hod.countriesByCode.get(voterCode) as any;
      const voterCountryId = voterCountry?.id ? String(voterCountry.id) : null;
      const hod = editionId ? canonical.hod.resolve(editionId, voterCountryId, "televote") : null;
      return { submission, hodPersonId: hod?.personId ?? null, voterCode };
    })
    .filter(({ hodPersonId, voterCode }) =>
      voterCode === countryCode || Boolean(currentHod?.personId && hodPersonId === currentHod.personId),
    )
    .sort((a, b) => new Date(b.submission.created_at).getTime() - new Date(a.submission.created_at).getTime());

  const previousIpHashes = [...new Set(
    historicalIdentitySubmissions.map(({ submission }) => submission.ip_hash).filter((value): value is string => Boolean(value)),
  )];
  const latestHistoricalIp = historicalIdentitySubmissions.find(({ submission }) => Boolean(submission.ip_hash))?.submission.ip_hash ?? null;
  const ipChanged = Boolean(network.ipHash && latestHistoricalIp && network.ipHash !== latestHistoricalIp);
  const technicalSignals: VoteIntegrityTechnicalSignal[] = ipChanged
    ? [{
        key: "ip_changed",
        title: "Connection fingerprint changed",
        description: "The hashed IP used for this ballot differs from the most recent recorded ballot linked to this HOD/country history. This is supporting technical context only. Solaris does not expect a fictional country to match the real-world location of an IP address.",
      }]
    : [];

  const relationshipFindings = findings.filter((finding) => finding.riskScore >= settings.riskNotable);
  const multiRelationshipBonus = new Set(relationshipFindings.map((finding) => finding.targetCode)).size >= 3 ? 6 : 0;
  const ipContextBonus = ipChanged && relationshipRisk >= settings.riskNotable ? 8 : 0;
  const riskScore = Math.min(100, relationshipRisk + multiRelationshipBonus + ipContextBonus);
  const requiresAttestation = relationshipRisk >= settings.riskNotable;
  const severity = severityForRisk(riskScore, settings);

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
  const history = {
    hodHistoryAvailable: Boolean(currentHod?.personId),
    televoteBallotsConsidered: historicalTelevoteBallots,
    juryBallotsConsidered: historicalJuryBallots,
    previousIpFingerprints: previousIpHashes.length,
    ipChanged,
  };

  const { error: insertError } = await tv.from("vote_preflight_checks").insert({
    id: token,
    round_id: input.roundId,
    username_normalized: username.toLowerCase(),
    country_code: countryCode,
    ballot_map: ballotMap(input.entries),
    ip_hash: network.ipHash,
    fingerprint_hash: input.fingerprintHash ?? null,
    device_token_hash: input.deviceTokenHash ?? null,
    ip_country: network.ipCountry,
    is_vpn: network.isVpn,
    hod_person_id: currentHod?.personId ?? null,
    relationship_risk: relationshipRisk,
    risk_score: riskScore,
    severity,
    requires_attestation: requiresAttestation,
    findings: relationshipFindings.slice(0, 10),
    technical_signals: technicalSignals,
    history_summary: history,
    statement_version: VOTE_INTEGRITY_STATEMENT_VERSION,
    expires_at: expiresAt,
  });
  if (insertError) throw new Error(insertError.message);

  return {
    token,
    expiresAt,
    automatic: true,
    relationshipRisk,
    riskScore,
    severity,
    requiresAttestation,
    findings: relationshipFindings.slice(0, 10),
    technicalSignals,
    history,
  };
}

export async function signVoteIntegrityAttestationServer(input: {
  token: string;
  signedName: string;
  acceptedAutomaticDetection: boolean;
  acceptedIndependence: boolean;
  acceptedConsequences: boolean;
}) {
  const token = String(input.token ?? "");
  const signedName = String(input.signedName ?? "").trim();
  if (!token || !signedName) throw new Error("Signature is required");
  if (!input.acceptedAutomaticDetection || !input.acceptedIndependence || !input.acceptedConsequences) {
    throw new Error("All voting-integrity declarations must be acknowledged");
  }

  const network = getTelevotingNetworkSignals();
  const tv = (supabaseAdmin as any).schema("televoting");
  const { data: row, error } = await tv
    .from("vote_preflight_checks")
    .select("id,username_normalized,requires_attestation,expires_at,submitted_at,ip_hash")
    .eq("id", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Voting integrity check not found");
  if (row.submitted_at) throw new Error("This ballot has already been submitted");
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new Error("Voting integrity check expired. Review the ballot again.");
  if (!row.requires_attestation) throw new Error("This ballot does not require an integrity declaration");
  if (signedName.toLowerCase() !== String(row.username_normalized).toLowerCase()) {
    throw new Error("Type the same username you registered with to sign the declaration");
  }
  if ((row.ip_hash ?? null) !== (network.ipHash ?? null)) {
    throw new Error("Your connection changed during the integrity review. Return to the ballot and run the automatic check again.");
  }

  const attestationText = `${VOTE_INTEGRITY_ATTESTATION}\n\n${VOTE_INTEGRITY_CONSEQUENCE}`;
  const { error: updateError } = await tv
    .from("vote_preflight_checks")
    .update({
      attested_at: new Date().toISOString(),
      signed_name: signedName,
      attestation_text: attestationText,
      attestation_ip_hash: network.ipHash,
    })
    .eq("id", token)
    .is("submitted_at", null);
  if (updateError) throw new Error(updateError.message);

  return { ok: true };
}
