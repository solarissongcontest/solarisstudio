import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { History, Search } from "lucide-react";
import { useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import {
  getWorldMembershipChronicle,
  getWorldMembershipInstitutions,
} from "@/lib/terra-world-membership-chronicle.functions";
import {
  WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE as PAGE_SIZE,
  type WorldMembershipChronicleScope,
} from "@/lib/terra-world-membership-chronicle";

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
  });
}

const PAGE_BUTTON = "min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-40";

export function TerraWorldMembershipChronicle() {
  const [scope, setScope] = useState<WorldMembershipChronicleScope>("all");
  const [organization, setOrganization] = useState("");
  const [countryDraft, setCountryDraft] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(0);

  const load = useServerFn(getWorldMembershipChronicle);
  const loadInstitutions = useServerFn(getWorldMembershipInstitutions);
  const institutions = useQuery({
    queryKey: ["terra-world", "membership-institutions"],
    queryFn: () => loadInstitutions(),
    staleTime: 10 * 60_000,
    refetchOnMount: "always",
    retry: 1,
  });
  const history = useQuery({
    queryKey: ["terra-world", "membership-history", scope, organization, country, page],
    queryFn: () => load({ data: { scope, organization, country, page } }),
    staleTime: 5 * 60_000,
    refetchOnMount: "always",
    retry: 1,
  });

  // Never reveal older publication-sensitive cache entries during revalidation.
  const verifiedInstitutions = institutions.isSuccess && institutions.isFetchedAfterMount &&
    !institutions.isFetching && !institutions.isRefetchError ? institutions.data : undefined;
  const verifiedHistory = history.isSuccess && history.isFetchedAfterMount &&
    !history.isFetching && !history.isRefetchError ? history.data : undefined;
  const total = verifiedHistory?.total ?? 0;
  const reset = () => {
    setCountryDraft("");
    setCountry("");
    setOrganization("");
    setScope("all");
    setPage(0);
  };

  return (
    <section aria-labelledby="world-membership-timeline-heading">
      <header className="max-w-3xl">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <History aria-hidden="true" className="size-4" /> Terra Solaris · Institutions
        </p>
        <h1 id="world-membership-timeline-heading" className="mt-3 text-3xl font-bold sm:text-5xl">
          Membership history
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Browse officially published membership terms. A membership does not imply a particular vote, election or treaty.
        </p>
      </header>

      <div className="mt-7 border-y border-border py-5">
        <form role="search" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setCountry(countryDraft.trim());
        }}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Institution
            <select value={organization} disabled={!verifiedInstitutions}
              onChange={(event) => { setOrganization(event.target.value); setPage(0); }}
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="">All published institutions</option>
              {(verifiedInstitutions ?? []).map((item) =>
                <option key={item.id} value={item.slug}>{item.shortName}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Country code
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3">
              <Search aria-hidden="true" className="size-4" />
              <input type="search" value={countryDraft} maxLength={16}
                onChange={(event) => setCountryDraft(event.target.value)} placeholder="e.g. OLA"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
            </span>
          </label>
          <button type="submit" className="min-h-11 self-end rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Apply
          </button>
        </form>

        {(institutions.isError || institutions.isRefetchError) ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Institution filters cannot be verified.
            <button type="button" onClick={() => void institutions.refetch()}
              className="ml-2 min-h-11 font-semibold text-primary underline">Retry filters</button>
          </p>
        ) : null}

        <div role="group" aria-label="Membership term status" className="mt-4 flex flex-wrap gap-2">
          {([["all", "All terms"], ["current", "Current terms"], ["ended", "Concluded terms"]] as const)
            .map(([key, label]) => (
              <button key={key} type="button" aria-pressed={scope === key}
                onClick={() => { setScope(key); setPage(0); }}
                className={scope === key
                  ? "min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  : "min-h-11 rounded-xl border border-border px-4 text-sm font-semibold"}>
                {label}
              </button>
            ))}
        </div>
      </div>

      <div className="mt-7" aria-live="polite">
        {!history.isError && (history.isPending || history.isFetching || !history.isFetchedAfterMount) ? (
          <div role="status" className="space-y-3">
            <p className="text-sm text-muted-foreground">Loading published membership records…</p>
            {[0, 1, 2].map((item) =>
              <div key={item} aria-hidden="true"
                className="h-20 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />)}
          </div>
        ) : null}
        {(history.isError || history.isRefetchError) ? (
          <div role="alert" className="space-y-3 rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold">Institutional history is unavailable</h2>
            <p className="text-sm text-muted-foreground">
              The official records could not be verified. Cached or assumed results are hidden.
            </p>
            <button type="button" onClick={() => void history.refetch()} className={PAGE_BUTTON}>
              Retry
            </button>
          </div>
        ) : null}

        {verifiedHistory && verifiedHistory.records.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-border p-6">
            <p className="font-semibold">No public membership terms match these filters.</p>
            <p className="text-sm text-muted-foreground">
              Unpublished or unrecorded membership is never inferred from an empty result.
            </p>
            {page > 0 && total > 0 ? <button type="button" onClick={() => setPage(0)}
              className={PAGE_BUTTON}>First page</button> : null}
            {(organization || country || scope !== "all") ? <button type="button" onClick={reset}
              className={PAGE_BUTTON}>Clear filters</button> : null}
          </div>
        ) : null}

        {verifiedHistory && verifiedHistory.records.length > 0 ? (
          <ol className="divide-y divide-border" aria-label="Published institutional membership terms">
            {verifiedHistory.records.map((entry) => (
              <li key={entry.id} className="grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex min-w-0 items-start gap-4">
                  <FlagChip code={entry.country.code} image={entry.country.flagImage}
                    color="#385A73" size="md" />
                  <div>
                    <Link to="/countries/$code" params={{ code: entry.country.code }}
                      className="font-semibold hover:text-primary hover:underline">
                      {entry.country.name}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {entry.organization.shortName} · {entry.type}
                    </p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {entry.status} · {entry.endedAt ? "Concluded" : "Current"}
                    </p>
                  </div>
                </div>
                <div className="space-y-1 text-sm sm:text-right">
                  <p>Started {dateLabel(entry.joinedAt)}</p>
                  <p className="text-muted-foreground">
                    {entry.endedAt ? "Ended " + dateLabel(entry.endedAt) : "No end recorded"}
                  </p>
                  <Link to="/world/organizations/$slug" params={{ slug: entry.organization.slug }}
                    search={{ tab: "overview" }}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
                    Institution
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {verifiedHistory && total > 0 ? (
          <nav aria-label="Membership history pages"
            className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total} public terms
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                className={PAGE_BUTTON}>Previous</button>
              <button type="button" disabled={page >= 200 || (page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((current) => current + 1)}
                className={PAGE_BUTTON}>Next</button>
            </div>
          </nav>
        ) : null}
        <p className="mt-6 border-t pt-5 text-xs leading-6 text-muted-foreground">
          Terms come from official TG2 records. Country names and flags reflect current public identity, not necessarily their historical appearance. No private institutional state is included.
        </p>
      </div>
    </section>
  );
}
