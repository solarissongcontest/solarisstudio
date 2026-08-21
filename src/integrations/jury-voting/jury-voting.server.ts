import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  canonicalEditionForRound,
  loadCanonicalVotingContextServer,
} from "@/integrations/televoting/canonical-context.server";
import { calculateFriendVotingRisk } from "@/integrations/televoting/friend-voting-math";
import { loadFriendVotingSettingsServer } from "@/integrations/televoting/friend-voting-settings.server";
import {
  VOTE_INTEGRITY_STATEMENT_VERSION,
  type VoteIntegrityFinding,
  type VoteIntegrityReport,
  type VoteIntegritySeverity,
  type VoteIntegrityTechnicalSignal,
} from "@/integrations/televoting/integrity";
import { getTelevotingNetworkSignals } from "@/integrations/televoting/network.server";
import { enforceTelevotingRateLimit } from "@/integrations/televoting/rate-limit.server";

export type JuryPreflightEntry = {
  target_country_id: string;
  points: number;
};

export type JuryPreflightInput = {
  showId: string;
  entries: JuryPreflightEntry[];
  accessToken: string;
  fingerprintHash?: string | null;
  deviceTokenHash?: string | null;
};

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

type RoundRow = { id: string; edition_id: string; status: string };
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

function severityForRisk(
  risk: number,
  settings: Awaited<ReturnType<typeof loadFriendVotingSettingsServer>>,
): VoteIntegritySeverity {
  if (risk >= settings.riskCritical) return "critical";
  if (risk >= settings.riskHigh) return "high";
  if (risk >= settings.riskStrong) return "strong";
  if (risk >= settings.riskReview) return "review";
  if (risk >= settings.riskNotable) return "notable";
  return "none";
}

function relationshipFinding(
  observations: Observation[],
  allObservations: Observation[],
  targetCode: string,
  lens: "hod" | "country",
  currentCountryCode: string,
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
      const reciprocal = reciprocalByEdition.get(observation.editionId) ?? {
        opportunities: 0,
        supported: false,
      };
      reciprocal.opportunities += 1;
      if (observation.supported && reverse.some((candidate) => candidate.supported)) {
        reciprocal.supported = true;
      }
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
    ? normalizedEditionAverages.reduce((sum, value) => sum + value, 0) /
      normalizedEditionAverages.length
    : 0;
  const reciprocalEditions = [...reciprocalByEdition.values()].filter(
    (row) => row.opportunities > 0,
  );
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
    scopeLabel:
      lens === "hod"
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

function sortedNumbers(values: number[]) {
  return [...values].sort((a, b) => b - a);
}

function sameNumbers(first: number[], second: number[]) {
  const a = sortedNumbers(first);
  const b = sortedNumbers(second);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export async function runJuryIntegrityPreflightServer(
  input: JuryPreflightInput,
): Promise<VoteIntegrityReport> {
  const network = getTelevotingNetworkSignals();
  enforceTelevotingRateLimit(
    `jury-preflight:${network.ipHash ?? input.deviceTokenHash ?? "account"}`,
    {
      limit: 12,
      windowMs: 60_000,
      message: "Too many jury ballot checks from this connection. Please wait a moment.",
    },
  );

  if (!input.accessToken) throw new Error("Sign in to your country account to jury vote");
  const authResult = await supabaseAdmin.auth.getUser(input.accessToken);
  const user = authResult.data.user;
  if (authResult.error || !user) throw new Error("Your Solaris sign-in has expired. Sign in again.");

  const db = supabaseAdmin as any;
  const [accountResult, showResult, windowResult, rosterResult, participantsResult, existingResult] =
    await Promise.all([
      db
        .from("country_accounts")
        .select("user_id,country_id,status,instagram_username,display_name")
        .eq("user_id", user.id)
        .maybeSingle(),
      db
        .from("shows")
        .select("id,edition_id,name,voting_config")
        .eq("id", input.showId)
        .maybeSingle(),
      db
        .from("jury_voting_windows")
        .select("show_id,status")
        .eq("show_id", input.showId)
        .maybeSingle(),
      db.from("voters").select("id,country_id").eq("show_id", input.showId),
      db
        .from("participants")
        .select("country_id")
        .eq("show_id", input.showId)
        .or("participation_status.is.null,participation_status.eq.confirmed"),
      db
        .from("jury_ballot_submissions")
        .select("id")
        .eq("show_id", input.showId)
        .eq("user_id", user.id)
        .limit(1),
    ]);

  for (const result of [
    accountResult,
    showResult,
    windowResult,
    rosterResult,
    participantsResult,
    existingResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const account = accountResult.data as any;
  const show = showResult.data as any;
  const window = windowResult.data as any;
  if (!account || account.status !== "active") throw new Error("An active country account is required");
  if (!show) throw new Error("Jury show not found");
  if (!window || window.status !== "open") throw new Error("Jury voting is not open for this show");
  if ((existingResult.data ?? []).length) throw new Error("Your country already submitted this jury ballot");

  const voting = (show.voting_config ?? {}) as Record<string, unknown>;
  if (voting.juryEnabled === false) throw new Error("Jury voting is disabled for this show");
  const pointScale = Array.isArray(voting.juryPoints) && voting.juryPoints.length
    ? voting.juryPoints.map(Number).filter(Number.isFinite)
    : [12, 10, 8, 7, 6, 5, 4, 3, 2, 1];
  const allowSelfVote = voting.allowSelfVote === true;

  const roster = (rosterResult.data ?? []) as Array<{ id: string; country_id: string | null }>;
  const participantIds = new Set(
    ((participantsResult.data ?? []) as Array<{ country_id: string | null }>)
      .map((row) => row.country_id)
      .filter((value): value is string => Boolean(value)),
  );
  const countryId = String(account.country_id);

  if (roster.length && !roster.some((row) => row.country_id === countryId)) {
    throw new Error("Your country is not in the jury roster for this show");
  }
  if (!roster.length && !participantIds.has(countryId)) {
    throw new Error("Your country is not eligible to jury vote in this show");
  }

  if (!Array.isArray(input.entries) || !sameNumbers(input.entries.map((entry) => entry.points), pointScale)) {
    throw new Error("Use every jury score exactly once");
  }
  if (new Set(input.entries.map((entry) => entry.target_country_id)).size !== input.entries.length) {
    throw new Error("Each country can receive only one jury score");
  }
  if (input.entries.some((entry) => !participantIds.has(entry.target_country_id))) {
    throw new Error("One or more selected countries are not in this show");
  }
  if (!allowSelfVote && input.entries.some((entry) => entry.target_country_id === countryId)) {
    throw new Error("You cannot vote for your own country");
  }

  const countryResult = await db
    .from("countries")
    .select("id,name,short_code")
    .eq("id", countryId)
    .single();
  if (countryResult.error) throw new Error(countryResult.error.message);
  const currentCountry = countryResult.data as any;
  const countryCode = upper(currentCountry.short_code ?? currentCountry.name);
  const username = String(
    account.instagram_username || account.display_name || currentCountry.short_code || countryCode,
  ).trim();

  const canonical = await loadCanonicalVotingContextServer();
  const settings = await loadFriendVotingSettingsServer();
  const currentHod = canonical.hod.resolve(String(show.edition_id), countryId, "jury");
  const tv = (supabaseAdmin as any).schema("televoting");

  const [roundsResult, submissionsResult, voteEntriesResult, roundEntriesResult] = await Promise.all([
    tv.from("rounds").select("id,edition_id,status").order("created_at", { ascending: true }),
    tv
      .from("vote_submissions")
      .select("id,round_id,country_code,ip_hash,status,deletion_category,created_at")
      .order("created_at", { ascending: true })
      .limit(50000),
    tv.from("vote_entries").select("submission_id,target_country_code,points").limit(250000),
    tv.from("round_entries").select("round_id,entry_key,country_code"),
  ]);
  for (const result of [roundsResult, submissionsResult, voteEntriesResult, roundEntriesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const rounds = (roundsResult.data ?? []) as RoundRow[];
  const canonicalEditionByRound = new Map<string, string>();
  for (const round of rounds) {
    const editionId = canonicalEditionForRound(canonical, round);
    if (editionId) canonicalEditionByRound.set(round.id, editionId);
  }

  const roundEntryRows = (roundEntriesResult.data ?? []) as RoundEntryRow[];
  const roundEntryCountry = new Map<string, string>();
  const participantsByRound = new Map<string, Set<string>>();
  for (const row of roundEntryRows) {
    const code = upper(row.country_code);
    if (!code) continue;
    roundEntryCountry.set(`${row.round_id}:${row.entry_key}`, code);
    const participants = participantsByRound.get(row.round_id) ?? new Set<string>();
    participants.add(code);
    participantsByRound.set(row.round_id, participants);
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
      const targetCode =
        roundEntryCountry.get(`${submission.round_id}:${entry.target_country_code}`) ??
        upper(entry.target_country_code);
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
    const historyParticipants = first.show_id
      ? canonical.participantsByShow.get(String(first.show_id)) ?? new Set<string>()
      : canonical.editionParticipants.get(String(first.edition_id)) ?? new Set<string>();
    if (historyParticipants.size) historicalJuryBallots += 1;
    for (const targetCountryId of historyParticipants) {
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

  const proposed = new Map(input.entries.map((entry) => [entry.target_country_id, entry.points]));
  const proposedMax = Math.max(0, ...pointScale);
  const currentParticipantIds = canonical.participantsByShow.get(String(show.id)) ?? participantIds;
  const supportedTargets: string[] = [];
  const targetNames = new Map<string, string>();

  for (const targetCountryId of currentParticipantIds) {
    if (targetCountryId === countryId) continue;
    const target = canonical.hod.countriesById.get(targetCountryId) as any;
    if (!target) continue;
    const targetCode = upper(target.short_code ?? target.name);
    targetNames.set(targetCode, String(target.name ?? targetCode));
    const score = proposed.get(targetCountryId) ?? 0;
    if (score > 0) supportedTargets.push(targetCode);
    allObservations.push({
      editionId: String(show.edition_id),
      channel: "jury",
      voterCode: countryCode,
      voterCountryId: countryId,
      hodPersonId: currentHod?.personId ?? null,
      targetCode,
      score,
      maxScore: proposedMax,
      supported: score > 0,
      maximum: score > 0 && proposedMax > 0 && score === proposedMax,
      normalized: proposedMax > 0 ? score / proposedMax : 0,
    });
  }

  const findings: VoteIntegrityFinding[] = [];
  const countryObservations = allObservations.filter(
    (observation) => observation.voterCode === countryCode,
  );
  const hodObservations = currentHod?.personId
    ? allObservations.filter((observation) => observation.hodPersonId === currentHod.personId)
    : [];

  for (const targetCode of supportedTargets) {
    const targetName = targetNames.get(targetCode) ?? targetCode;
    const countryFinding = relationshipFinding(
      countryObservations,
      allObservations,
      targetCode,
      "country",
      countryCode,
      targetName,
      settings,
    );
    if (countryFinding) findings.push(countryFinding);

    if (currentHod?.personId) {
      const hodFinding = relationshipFinding(
        hodObservations,
        allObservations,
        targetCode,
        "hod",
        countryCode,
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
    .filter(
      ({ hodPersonId, voterCode }) =>
        voterCode === countryCode ||
        Boolean(currentHod?.personId && hodPersonId === currentHod.personId),
    )
    .sort(
      (a, b) =>
        new Date(b.submission.created_at).getTime() - new Date(a.submission.created_at).getTime(),
    );

  const previousIpHashes = [
    ...new Set(
      historicalIdentitySubmissions
        .map(({ submission }) => submission.ip_hash)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const latestHistoricalIp =
    historicalIdentitySubmissions.find(({ submission }) => Boolean(submission.ip_hash))?.submission
      .ip_hash ?? null;
  const ipChanged = Boolean(
    network.ipHash && latestHistoricalIp && network.ipHash !== latestHistoricalIp,
  );
  const technicalSignals: VoteIntegrityTechnicalSignal[] = ipChanged
    ? [
        {
          key: "ip_changed",
          title: "Connection fingerprint changed",
          description:
            "The hashed IP used for this jury ballot differs from the most recent recorded ballot linked to this HOD/country history. This is supporting technical context only. Solaris does not expect a fictional country to match the real-world location of an IP address.",
        },
      ]
    : [];

  const relationshipFindings = findings.filter(
    (finding) => finding.riskScore >= settings.riskNotable,
  );
  const multiRelationshipBonus =
    new Set(relationshipFindings.map((finding) => finding.targetCode)).size >= 3 ? 6 : 0;
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
  const ballotMap = Object.fromEntries(
    input.entries.map((entry) => [entry.target_country_id, entry.points]),
  );

  const { error: insertError } = await tv.from("vote_preflight_checks").insert({
    id: token,
    round_id: null,
    channel: "jury",
    canonical_edition_id: show.edition_id,
    show_id: show.id,
    account_user_id: user.id,
    username_normalized: username.toLowerCase(),
    country_code: countryCode,
    ballot_map: ballotMap,
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
