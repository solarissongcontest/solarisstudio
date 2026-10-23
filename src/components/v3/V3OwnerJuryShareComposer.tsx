import { V3JuryShareProjectionComposer } from "./V3JuryShareProjectionComposer";
import { V3Surface } from "./V3Foundation";
import { useV3OwnerJuryShareProjection } from "@/lib/v3-jury-share-owner-runtime";

function unavailableCopy(code: string) {
  switch (code) {
    case "JURY_SHARE_CONTRACT_UNAVAILABLE":
      return {
        title: "Jury sharing is not available yet",
        body: "The canonical Jury Share System projection is not available on this deployment. Solaris will not reconstruct your ballot from browser or legacy data.",
      };
    case "JURY_SHARE_NOT_PUBLISHED":
      return {
        title: "Share after results",
        body: "Your official jury-vote graphic becomes available after the corresponding Results and Jury Results are canonically published.",
      };
    case "JURY_SHARE_NOT_AUTHORIZED":
      return {
        title: "This ballot is not available in Me",
        body: "Solaris could not prove owner access for this private ballot. Already-public country ballots belong to the public Results experience.",
      };
    case "JURY_SHARE_BALLOT_NOT_FOUND":
      return {
        title: "Final jury vote unavailable",
        body: "Solaris could not find a finalized valid ballot for this Show and country.",
      };
    case "JURY_SHARE_RESULT_CHANGED":
      return {
        title: "Official result changed",
        body: "Solaris cannot prove that this ballot matches the currently published Result Version, so no share card is generated.",
      };
    case "JURY_SHARE_ASSET_FAILED":
      return {
        title: "Historical identity unavailable",
        body: "A required historical country name or flag is missing. Solaris will not fabricate the card.",
      };
    default:
      return {
        title: "Share card unavailable",
        body: "Solaris could not build a verified Jury Share projection for this result.",
      };
  }
}

export function V3OwnerJuryShareComposer({
  showId,
  countryId,
}: {
  showId: string;
  countryId: string;
}) {
  const query = useV3OwnerJuryShareProjection({ showId, countryId, enabled: true });

  if (query.isLoading) {
    return (
      <V3Surface className="p-5">
        <p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">
          Verifying your official jury vote…
        </p>
      </V3Surface>
    );
  }

  if (query.isError || !query.data) {
    return (
      <V3Surface className="p-5">
        <h2 className="font-semibold">Couldn&apos;t load this jury vote</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--v3-text-secondary)]">
          Check your connection and try again. No share image was created and no ballot data was reconstructed locally.
        </p>
      </V3Surface>
    );
  }

  if (query.data.status !== "available") {
    const copy = unavailableCopy(query.data.code);
    return (
      <V3Surface className="p-5">
        <h2 className="font-semibold">{copy.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--v3-text-secondary)]">{copy.body}</p>
      </V3Surface>
    );
  }

  const initial = query.data;
  const scopeNote = initial.visibility === "private"
    ? "This authenticated owner view does not make your ballot public; public visibility remains controlled by canonical publication policy."
    : "Detailed voting is already public, so this page presents the same official public ballot without treating the URL itself as ownership proof.";

  return (
    <div className="space-y-4" data-v3-owner-jury-share={initial.visibility}>
      <V3Surface className="p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v3-text-tertiary)]">
          {initial.visibility === "private" ? "Private owner access" : "Published detailed voting"}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--v3-text-secondary)]">
          {scopeNote}
        </p>
      </V3Surface>

      <V3JuryShareProjectionComposer
        projection={initial.projection}
        scopeNote={scopeNote}
        refreshProjection={async () => {
          const refreshed = await query.refetch();
          if (!refreshed.data || refreshed.data.status !== "available") {
            throw new Error("This jury vote is no longer shareable under the current official state.");
          }
          return refreshed.data.projection;
        }}
      />
    </div>
  );
}
