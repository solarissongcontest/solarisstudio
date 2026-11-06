import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  WORLD_BODY_OFFICE_MAX_PAGE,
  readPublicBodyOfficesPage,
} from "@/lib/terra-world-body-office-pages";
import {
  WORLD_BODY_OFFICE_LIMIT,
  type PublicWorldBody,
  type PublicWorldInstitution,
} from "@/lib/terra-world-bodies-public";

/**
 * Self-contained, publication-safe office list to be mounted by WORLD-00 in
 * WorldBodyDetails. No existing shell, route, or World owner's file is edited.
 *
 * Unlike the previous first-20 preview this component can page through every
 * permitted office, and never renders stale private results during rechecks.
 */
export function WorldBodyOfficePager({
  organization, body, verificationVersion, online,
}: {
  organization: PublicWorldInstitution;
  body: PublicWorldBody;
  verificationVersion: number;
  online: boolean;
}) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [organization.id, body.id]);

  const query = useQuery({
    queryKey: ["world", "public", "body-offices-paged",
      organization.id, body.id, verificationVersion, page],
    queryFn: ({ signal }) => readPublicBodyOfficesPage(organization, body, page, signal),
    enabled: online,
    staleTime: 90_000,
    refetchOnMount: "always",
    retry: false,
  });

  // There is no placeholderData or keepPreviousData here. A withdrawn office,
  // unpublished organ or changing publication scope must not remain on screen.
  const verified = online && query.isSuccess && query.isFetchedAfterMount &&
    !query.isFetching && !query.isRefetchError ? query.data : undefined;
  const lastPage = verified
    ? Math.max(0, Math.min(WORLD_BODY_OFFICE_MAX_PAGE,
        Math.ceil(verified.total / WORLD_BODY_OFFICE_LIMIT) - 1))
    : 0;

  useEffect(() => {
    if (verified && page > lastPage) setPage(lastPage);
  }, [lastPage, page, verified]);

  const start = page * WORLD_BODY_OFFICE_LIMIT;
  const shown = verified?.offices.length ?? 0;
  const showData = !!verified && page <= lastPage;

  return <section aria-label="Active public offices">
    <h2 className="font-semibold">Active offices of this body</h2>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      Current public office definitions only. Private appointments and historical officeholders are excluded.
    </p>

    {!online ? <p role="alert" className="mt-4 text-sm text-muted-foreground">
      Reconnect to verify published offices. Unverified cached records are hidden.
    </p> : null}
    {online && (query.isPending || query.isFetching || !query.isFetchedAfterMount) && !query.isError
      ? <p role="status" aria-busy="true" className="mt-4 text-sm text-muted-foreground">
        Checking public offices…
      </p> : null}
    {online && query.isError ? <div role="alert" className="mt-4 text-sm">
      <p>Public office records could not be verified.</p>
      <button type="button" onClick={() => void query.refetch()}
        className="mt-3 min-h-11 rounded-xl border border-border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
        Retry office records
      </button>
    </div> : null}

    {showData ? <>
      <p role="status" aria-live="polite" className="mt-4 text-xs tabular-nums text-muted-foreground">
        {verified.total === 0 ? "No active public offices are recorded."
          : "Showing " + (start + 1) + "–" + (start + shown) + " of " + verified.total + " offices"}
      </p>
      {shown > 0 ? <ul className="mt-3 divide-y divide-border">
        {verified.offices.map((office) => <li key={office.id} className="py-3">
          <p className="text-sm font-semibold">{office.title}</p>
          <p className="mt-1 text-xs capitalize text-muted-foreground">
            {office.officeType.replace(/_/g, " ")}
          </p>
        </li>)}
      </ul> : null}
      {verified.total > WORLD_BODY_OFFICE_LIMIT ? <nav aria-label="Public office pages"
        className="mt-5 flex items-center justify-between gap-2">
        <button type="button" disabled={page === 0}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
          className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
          Previous
        </button>
        <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          Page {page + 1} of {lastPage + 1}
        </span>
        <button type="button"
          disabled={page >= lastPage || page >= WORLD_BODY_OFFICE_MAX_PAGE}
          onClick={() => setPage((value) => Math.min(lastPage, value + 1))}
          className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
          Next
        </button>
      </nav> : null}
      {page === WORLD_BODY_OFFICE_MAX_PAGE && verified.total > (page + 1) * WORLD_BODY_OFFICE_LIMIT
        ? <p className="mt-3 text-xs text-muted-foreground">
          Additional records exist beyond the bounded directory. Contact an organizer for assistance.
        </p> : null}
    </> : null}
    {online && verified && page > lastPage ? <p role="status" className="mt-4 text-sm text-muted-foreground">
      Refreshing the last available office page…
    </p> : null}
  </section>;
}
