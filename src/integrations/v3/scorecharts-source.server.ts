import { loadPublicResultSnapshotHeaders, type PublicResultSnapshotClient } from "@/lib/v3-public-result-snapshots";
import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import type { Edition, Show } from "@/lib/data";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import type {
  V3ScorechartIndexItem,
  V3ScorechartsBundle,
} from "@/lib/v3-scorecharts";

const EDITION_COLUMNS = "id,edition_number,name,slug,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,publication_config";

type ScorechartsSourceClient = PublicResultSnapshotClient & {
  from(table: string): any;
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

function publicEditionLabel(edition: Pick<Edition, "edition_number" | "name">) {
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

/**
 * Focused Public V3 source for the Scorecharts index.
 *
 * The index needs only published edition/show metadata. It deliberately does not
 * read result rows, jury ballots or country matrices. Those remain on the
 * established show result route and are reachable only when detailed_voting is
 * canonically published for that show.
 */
export async function loadV3ScorechartsBundle(client: ScorechartsSourceClient = createConfirmationPublicRuntimeClient() as unknown as ScorechartsSourceClient): Promise<V3ScorechartsBundle> {

  const editionsResult = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("published", true)
    .order("edition_number", { ascending: false });
  throwIfError(
    editionsResult.error,
    "Could not load public Solaris editions for Scorecharts",
  );

  const editions = (editionsResult.data ?? []) as Edition[];
  const latestEdition = editions[0] ?? null;
  if (!editions.length) {
    return {
      rolloutEditionSlug: null,
      shell: { editionLabel: "Solaris Studio", phaseLabel: "Scorecharts" },
      items: [],
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
    .in(
      "edition_id",
      editions.map((edition) => edition.id),
    );
  throwIfError(
    showsResult.error,
    "Could not load public shows for Scorecharts",
  );

  const candidateShows = ((showsResult.data ?? []) as Show[])
    .filter(
      (show) =>
        isShowPublic(show) &&
        resolveShowPublication(show).detailed_voting === true,
    )
    .sort((a, b) => {
      const editionDifference =
        (editionOrder.get(b.edition_id) ?? Number.MIN_SAFE_INTEGER) -
        (editionOrder.get(a.edition_id) ?? Number.MIN_SAFE_INTEGER);
      if (editionDifference !== 0) return editionDifference;
      return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
    });

  const snapshots = await loadPublicResultSnapshotHeaders(client, candidateShows.map((show) => show.id));
  const scorechartShows = candidateShows.filter((show) => snapshots.get(show.id)?.editionId === show.edition_id && snapshots.get(show.id)!.availability.detailedVoting);
  const resultCoverage = { includedShows: scorechartShows.length, unavailableShows: candidateShows.length - scorechartShows.length };

  const items = scorechartShows.flatMap((show) => {
    const edition = editionMap.get(show.edition_id);
    if (!edition?.slug) return [];
    return [
      {
        showId: show.id,
        showName: show.name,
        showKind: show.kind,
        editionId: edition.id,
        editionName: publicEditionLabel(edition),
        editionSlug: edition.slug,
        editionNumber: edition.edition_number ?? null,
      } satisfies V3ScorechartIndexItem,
    ];
  });

  return {
    rolloutEditionSlug: items[0]?.editionSlug ?? latestEdition?.slug ?? null,
    shell: {
      editionLabel:
        items[0]?.editionName ??
        (latestEdition ? publicEditionLabel(latestEdition) : "Solaris Studio"),
      phaseLabel: "Scorecharts",
    },
    items,
    resultCoverage,
    generatedAt: new Date().toISOString(),
  };
}
