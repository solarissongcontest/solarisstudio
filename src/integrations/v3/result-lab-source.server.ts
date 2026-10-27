import { loadPublicResultSnapshots, loadPublicResultSnapshotHeaders, type PublicResultCoverage } from "@/lib/v3-public-result-snapshots";
import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import type {
  Country,
  Edition,
  JuryVote,
  ResultRow,
  Show,
  Voter,
} from "@/lib/data";
import { matchVoterKey, resolveShowVoters } from "@/lib/data";
import { entityDisplayMap, entityKeyOf, type ContestEntityRow } from "@/lib/entities";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import type { ResultLabJuryVote, ResultLabOfficialEntry } from "@/lib/result-lab";
import type {
  V3ResultLabBundle,
  V3ResultLabIdentity,
  V3ResultLabShowOption,
  V3ResultLabVoter,
} from "@/lib/v3-result-lab";

const EDITION_COLUMNS = "id,edition_number,name,slug,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,publication_config";
const JURY_COLUMNS =
  "id,edition_id,show_id,voter_country_id,voter_id,voter_entity_id,receiving_country_id,receiving_entity_id,points";
const ENTITY_COLUMNS =
  "id,edition_id,entity_type,country_id,display_name,abbreviation,flag_image,region,historical_identity_override";
const COUNTRY_COLUMNS =
  "id,name,native_name,short_code,flag_image,region,accent_color,description,first_participation";

type ResultLabSourceClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

function throwIfError(error: unknown, label: string) {
  if (!error) return;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? label)
        : label;
  throw new Error(`${label}: ${message}`);
}

function editionLabel(edition: Pick<Edition, "edition_number" | "name"> | null) {
  if (!edition) return "Solaris Studio";
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

/**
 * Server-owned official input projection for Result Lab.
 *
 * The returned data is immutable public truth. Scenario configuration remains a
 * browser-only concern and is never sent back as a result mutation.
 */
export async function loadV3ResultLabBundle(
  requestedShowId?: string | null,
  client: ResultLabSourceClient = createConfirmationPublicRuntimeClient() as unknown as ResultLabSourceClient,
): Promise<V3ResultLabBundle> {
  let resultCoverage: PublicResultCoverage = { includedShows: 0, unavailableShows: 0 };

  const editionsResult = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("published", true)
    .order("edition_number", { ascending: false });
  throwIfError(editionsResult.error, "Could not load public editions for Result Lab");

  const editions = (editionsResult.data ?? []) as Edition[];
  const latestEdition = editions[0] ?? null;
  if (!editions.length) {
    return {
      rolloutEditionSlug: null,
      shell: { editionLabel: "Solaris Studio", phaseLabel: "Result Lab" },
      options: [],
      selectedShowId: null,
      detailedVotingPublic: false,
      officialEntries: [],
      juryVotes: [],
      voters: [],
      identities: [],
      resultCoverage,
      generatedAt: new Date().toISOString(),
    };
  }

  const editionMap = new Map(editions.map((edition) => [edition.id, edition]));
  const editionOrder = new Map(
    editions.map((edition, index) => [
      edition.id,
      edition.edition_number ?? -index - 1,
    ]),
  );

  const showsResult = await client
    .from("shows")
    .select(SHOW_COLUMNS)
    .eq("published", true)
    .in("edition_id", editions.map((edition) => edition.id));
  throwIfError(showsResult.error, "Could not load public shows for Result Lab");

  const candidateShows = ((showsResult.data ?? []) as Show[])
    .filter((show) => {
      if (!isShowPublic(show)) return false;
      const publication = resolveShowPublication(show);
      return (
        publication.results === true &&
        publication.jury_results === true &&
        publication.televote_results === true
      );
    })
    .sort((a, b) => {
      const editionDifference =
        (editionOrder.get(b.edition_id) ?? Number.MIN_SAFE_INTEGER) -
        (editionOrder.get(a.edition_id) ?? Number.MIN_SAFE_INTEGER);
      if (editionDifference !== 0) return editionDifference;
      return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
    });

  const snapshots = await loadPublicResultSnapshotHeaders(client, candidateShows.map((show) => show.id));
  const eligibleShows = candidateShows.filter((show) => {
    const snapshot = snapshots.get(show.id);
    return snapshot?.editionId === show.edition_id && snapshot.availability.jury && snapshot.availability.televote;
  });

  resultCoverage = { includedShows: eligibleShows.length, unavailableShows: candidateShows.length - eligibleShows.length };

  const options = eligibleShows.flatMap((show) => {
    const edition = editionMap.get(show.edition_id);
    if (!edition?.slug) return [];
    return [{
      id: show.id,
      name: show.name,
      kind: show.kind,
      editionId: edition.id,
      editionName: editionLabel(edition),
      editionSlug: edition.slug,
      editionNumber: edition.edition_number ?? null,
    } satisfies V3ResultLabShowOption];
  });

  const selectedShow =
    eligibleShows.find((show) => show.id === requestedShowId) ??
    eligibleShows[0] ??
    null;
  const selectedEdition = selectedShow
    ? editionMap.get(selectedShow.edition_id) ?? null
    : latestEdition;

  if (!selectedShow || !selectedEdition) {
    return {
      rolloutEditionSlug: selectedEdition?.slug ?? null,
      shell: {
        editionLabel: editionLabel(selectedEdition),
        phaseLabel: "Result Lab",
      },
      options,
      selectedShowId: null,
      detailedVotingPublic: false,
      officialEntries: [],
      juryVotes: [],
      voters: [],
      identities: [],
      resultCoverage,
      generatedAt: new Date().toISOString(),
    };
  }

  const snapshot = (await loadPublicResultSnapshots(client, [selectedShow.id])).get(selectedShow.id);
  if (!snapshot || snapshot.editionId !== selectedEdition.id
      || snapshot.resultVersion !== snapshots.get(selectedShow.id)!.resultVersion
      || snapshot.publicationVersion !== snapshots.get(selectedShow.id)!.publicationVersion) {
    throw new Error("Published results changed during this read. Refresh to load the current publication.");
  }
  const detailedVotingPublic = snapshot.availability.detailedVoting;

  const [entitiesResult, countriesResult] =
    await Promise.all([
      client
        .from("contest_entities")
        .select(ENTITY_COLUMNS)
        .eq("edition_id", selectedEdition.id),
      client.from("countries").select(COUNTRY_COLUMNS),
    ]);

  throwIfError(entitiesResult.error, "Could not load public Result Lab identities");
  throwIfError(countriesResult.error, "Could not load public Result Lab countries");

  const rows = snapshot.rows;
  const entities = (entitiesResult.data ?? []) as ContestEntityRow[];
  const countries = (countriesResult.data ?? []) as Country[];
  const displayMap = entityDisplayMap(entities, countries);

  const officialEntries: ResultLabOfficialEntry[] = rows.flatMap((row) => {
    const id = entityKeyOf(row);
    const display = displayMap.get(id);
    if (!display) return [];
    return [{
      id,
      name: display.name,
      juryPoints: row.jury_points,
      televotePoints: row.televote_points,
      officialRank: row.final_rank,
    }];
  });

  const identities: V3ResultLabIdentity[] = officialEntries.flatMap((entry) => {
    const display = displayMap.get(entry.id);
    if (!display) return [];
    return [{
      id: entry.id,
      name: display.name,
      shortCode: display.short_code,
      flagImage: display.flag_image,
      accentColor: display.accent_color,
    }];
  });

  let juryVotes: ResultLabJuryVote[] = [];
  let voters: V3ResultLabVoter[] = [];

  if (detailedVotingPublic) {
    const [juryResult, votersResult] = await Promise.all([
      client
        .from("jury_votes")
        .select(JURY_COLUMNS)
        .eq("show_id", selectedShow.id),
      client.from("voters").select("*").eq("show_id", selectedShow.id),
    ]);
    throwIfError(juryResult.error, "Could not load published Result Lab jury ballots");
    throwIfError(votersResult.error, "Could not load public Result Lab voters");

    const rawJuryVotes = (juryResult.data ?? []) as JuryVote[];
    const rawVoters = (votersResult.data ?? []) as Voter[];
    const participantIds = rows.map(entityKeyOf);
    const voterOptions = resolveShowVoters(rawVoters, participantIds, countries);

    juryVotes = rawJuryVotes.flatMap((vote) => {
      const voterKey = matchVoterKey(vote, voterOptions);
      const recipientId = vote.receiving_entity_id || vote.receiving_country_id;
      if (!voterKey || !recipientId || !displayMap.has(recipientId)) return [];
      return [{ voterKey, recipientId, points: vote.points }];
    });

    const voteKeys = new Set(juryVotes.map((vote) => vote.voterKey));
    const optionMap = new Map(voterOptions.map((option) => [option.key, option]));

    for (const vote of rawJuryVotes) {
      const key = matchVoterKey(vote, voterOptions);
      if (!key || optionMap.has(key)) continue;
      const countryId = vote.voter_entity_id || vote.voter_country_id || "";
      const display = countryId ? displayMap.get(countryId) : undefined;
      optionMap.set(key, {
        key,
        voterId: vote.voter_id ?? null,
        countryId: countryId || null,
        name: display?.name ?? key,
        short_code: display?.short_code ?? null,
        flag_image: display?.flag_image ?? null,
        accent_color: display?.accent_color ?? "#8888aa",
      });
    }

    voters = [...optionMap.values()]
      .filter((option) => voteKeys.has(option.key))
      .map((option) => ({
        key: option.key,
        name: option.name,
        shortCode: option.short_code ?? null,
        flagImage: option.flag_image ?? null,
        accentColor: option.accent_color ?? "#8888aa",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    rolloutEditionSlug: selectedEdition.slug,
    shell: {
      editionLabel: editionLabel(selectedEdition),
      phaseLabel: "Result Lab",
    },
    options,
    selectedShowId: selectedShow.id,
    detailedVotingPublic,
    officialEntries,
    juryVotes,
    voters,
    identities,
    resultCoverage,
    generatedAt: new Date().toISOString(),
  };
}
