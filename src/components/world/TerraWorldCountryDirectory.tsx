import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Search } from "lucide-react";
import { useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import { getTerraWorldCountryDirectory } from "@/lib/terra-world-country-international.functions";
import { WORLD_COUNTRY_PAGE_SIZE } from "@/lib/terra-world-country-international";

export function TerraWorldCountryDirectory() {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const load = useServerFn(getTerraWorldCountryDirectory);
  const query = useQuery({
    queryKey: ["terra-world", "country-international-directory", search, page],
    queryFn: () => load({ data: { page, search } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return (
    <section aria-labelledby="world-countries-title">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Terra Solaris · Country discovery
        </p>
        <h1 id="world-countries-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          Countries of Terra Solaris
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
          Explore verified country identity and formal international relationships. Contest participation and institutional membership are different things.
        </p>
      </header>

      <form
        role="search"
        className="mt-8 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setSearch(draft.trim());
        }}
      >
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search country names and codes</span>
          <input
            type="search"
            value={draft}
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search countries or country codes"
            className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
        <button type="submit" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
          Search
        </button>
      </form>

      <div className="mt-7" aria-live="polite">
        {query.isPending ? (
          <div role="status" className="space-y-3">
            <p className="text-sm text-muted-foreground">Loading countries…</p>
            <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((index) =>
                <div key={index} className="h-20 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
              )}
            </div>
          </div>
        ) : null}

        {query.isError ? (
          <div role="alert" className="rounded-2xl border border-border p-5">
            <p className="font-semibold">Country discovery is temporarily unavailable.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The canonical public country service could not be reached. No cached or fictional replacement list has been invented.
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-4 min-h-11 rounded-xl border border-border px-5 text-sm font-semibold"
            >
              Retry
            </button>
          </div>
        ) : null}

        {query.isSuccess && query.data.countries.length === 0 ? (
          <p className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
            {search ? "No country matches that search." : "No public country identities are available yet."}
          </p>
        ) : null}

        {query.isSuccess && query.data.countries.length > 0 ? (
          <ul className="grid gap-x-8 gap-y-0 sm:grid-cols-2" aria-label="Terra Solaris countries">
            {query.data.countries.map((country) =>
              <li key={country.id} className="border-b border-border/60">
                <Link
                  to="/world/countries/$code"
                  params={{ code: country.code }}
                  className="group flex min-h-20 items-center gap-4 py-3 outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <FlagChip
                    code={country.code}
                    color="#385A73"
                    image={country.flagImage}
                    size="md"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{country.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {country.region ?? "Terra Solaris"} · {country.code}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
                </Link>
              </li>
            )}
          </ul>
        ) : null}

        {query.isSuccess && query.data.total > 0 ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-sm text-muted-foreground">
            <span>
              Showing {page * WORLD_COUNTRY_PAGE_SIZE + 1}–{Math.min(query.data.total, (page + 1) * WORLD_COUNTRY_PAGE_SIZE)} of {query.data.total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                className="min-h-11 rounded-xl border border-border px-4 font-semibold text-foreground disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={(page + 1) * WORLD_COUNTRY_PAGE_SIZE >= query.data.total}
                onClick={() => setPage((current) => current + 1)}
                className="min-h-11 rounded-xl border border-border px-4 font-semibold text-foreground disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
