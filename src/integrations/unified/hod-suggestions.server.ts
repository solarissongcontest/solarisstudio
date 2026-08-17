import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSolarisOrganizerServer } from "@/integrations/supabase/organizer.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import { loadHodResolverServer } from "@/integrations/unified/hod-history.server";

export type HodIdentitySuggestion = {
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  suggestedDisplayName: string;
  normalizedUsername: string;
  dominantBallots: number;
  totalBallots: number;
  confidence: number;
  ambiguous: boolean;
  evidenceRounds: number;
};

function normalizeUsername(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 100);
}

export async function getHodIdentitySuggestionsServer(): Promise<HodIdentitySuggestion[]> {
  await requireSolarisOrganizerServer();
  const db = supabaseAdmin as any;
  const hod = await loadHodResolverServer();

  const [editionLinksResult, bindingsResult, roundsResult, submissionsResult] = await Promise.all([
    db
      .from("integration_links")
      .select("remote_id,solaris_id")
      .eq("service", "televoting")
      .eq("entity_type", "edition"),
    db
      .from("televoting_round_bindings")
      .select("remote_round_id,edition_id"),
    televotingAdmin
      .from("rounds")
      .select("id,edition_id,name"),
    televotingAdmin
      .from("vote_submissions")
      .select("id,round_id,country_code,username,username_normalized,status")
      .limit(50000),
  ]);

  for (const result of [editionLinksResult, bindingsResult, roundsResult, submissionsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const canonicalByRemoteEdition = new Map<string, string>();
  for (const link of editionLinksResult.data ?? []) {
    canonicalByRemoteEdition.set(String(link.remote_id), String(link.solaris_id));
  }
  const canonicalByRound = new Map<string, string>();
  for (const binding of bindingsResult.data ?? []) {
    if (binding.edition_id) canonicalByRound.set(String(binding.remote_round_id), String(binding.edition_id));
  }
  const remoteEditionByRound = new Map<string, string>();
  for (const round of roundsResult.data ?? []) {
    remoteEditionByRound.set(String(round.id), String(round.edition_id));
  }

  type Candidate = {
    rawNames: Map<string, number>;
    usernames: Map<string, number>;
    rounds: Set<string>;
    total: number;
  };
  const candidates = new Map<string, Candidate>();

  for (const submission of submissionsResult.data ?? []) {
    if (submission.status === "deleted") continue;
    const roundId = String(submission.round_id);
    const editionId = canonicalByRound.get(roundId)
      ?? canonicalByRemoteEdition.get(remoteEditionByRound.get(roundId) ?? "");
    if (!editionId) continue;

    const countryCode = String(submission.country_code ?? "").trim().toUpperCase();
    const country = hod.countriesByCode.get(countryCode) as any;
    if (!country?.id) continue;

    // Existing organizer history always wins. Suggestions only fill gaps.
    if (hod.resolve(editionId, String(country.id), "televote")) continue;

    const rawName = String(submission.username ?? "").trim();
    const normalized = normalizeUsername(submission.username_normalized || rawName);
    if (!normalized) continue;

    const key = `${editionId}:${country.id}`;
    const candidate = candidates.get(key) ?? {
      rawNames: new Map<string, number>(),
      usernames: new Map<string, number>(),
      rounds: new Set<string>(),
      total: 0,
    };
    candidate.total += 1;
    candidate.rounds.add(roundId);
    candidate.usernames.set(normalized, (candidate.usernames.get(normalized) ?? 0) + 1);
    if (rawName) candidate.rawNames.set(`${normalized}\u0000${rawName}`, (candidate.rawNames.get(`${normalized}\u0000${rawName}`) ?? 0) + 1);
    candidates.set(key, candidate);
  }

  const suggestions: HodIdentitySuggestion[] = [];
  for (const [key, candidate] of candidates) {
    const splitAt = key.indexOf(":");
    const editionId = key.slice(0, splitAt);
    const countryId = key.slice(splitAt + 1);
    const edition = hod.editionsById.get(editionId) as any;
    const country = hod.countriesById.get(countryId) as any;
    if (!edition || !country) continue;

    const ranked = [...candidate.usernames.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [normalizedUsername, dominantBallots] = ranked[0] ?? ["", 0];
    if (!normalizedUsername || !dominantBallots) continue;

    const rawRanked = [...candidate.rawNames.entries()]
      .filter(([rawKey]) => rawKey.startsWith(`${normalizedUsername}\u0000`))
      .sort((a, b) => b[1] - a[1]);
    const suggestedDisplayName = rawRanked[0]?.[0].split("\u0000")[1] || normalizedUsername;
    const confidence = candidate.total ? Math.round((dominantBallots / candidate.total) * 100) : 0;

    suggestions.push({
      editionId,
      editionNumber: edition.edition_number == null ? null : Number(edition.edition_number),
      editionName: String(edition.name),
      countryId,
      countryCode: String(country.short_code ?? ""),
      countryName: String(country.name),
      suggestedDisplayName,
      normalizedUsername,
      dominantBallots,
      totalBallots: candidate.total,
      confidence,
      ambiguous: confidence < 75 || ranked.length > 1,
      evidenceRounds: candidate.rounds.size,
    });
  }

  return suggestions.sort((a, b) =>
    b.confidence - a.confidence
    || (b.editionNumber ?? -1) - (a.editionNumber ?? -1)
    || a.countryName.localeCompare(b.countryName),
  );
}
