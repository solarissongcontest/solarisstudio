import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, History, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import {
  getWorldMembershipChronicle,
  getWorldMembershipInstitutions,
} from "@/lib/terra-world-membership-chronicle.functions";
import {
  WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE,
  type WorldMembershipChronicleScope,
} from "@/lib/terra-world-membership-chronicle";

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
  });
}

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
    retry: 1,
  });
  const history = useQuery({
    queryKey: ["terra-world", "membership-history", scope, organization, country, page],
    queryFn: () => load({ data: { scope, organization, country, page } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const total = history.data?.total ?? 0;
  return (
    <section aria-labelledby="world-membership-timeline-heading">
      <header className="max-w-3xl">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.19em] text-primary">
          <History aria-hidden="true" className="size-4" />
          Terra Solaris · Institutions
        </p>
        <h1 id="world-membership-timeline-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          Membership history
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
          Follow the official, published membership terms connecting Terra Solaris countries with international institutions. A record of membership is not evidence of an election, vote or treaty.
        </p>
      </header>

      <div className="mt-8 border-y border-border/60 py-5">
        <form
          role="search"
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(0);
            setCountry(countryDraft.trim());
          }}
        >
          <label className="flex flex-col gap-2 text-xs font-semibold text-muted-foreground">
            Institution
            <select
              value={organization}
              disabled={institutions.isPending || institutions.isError}
              onChange={(event) => {
                setOrganization(event.target.value);
                setPage(0);
              }}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
            >
              <option value="">All published institutions</option>
              {(institutions.data ?? []).map((item) => (
                <option key={item.id} value={item.slug}>{item.shortName}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold text-muted-foreground">
            Country code
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3">
              <Search aria-hidden="true" className="size-4 shrink-0" />
              <input
                type="search"
                value={countryDraft}
                onChange={(event) => setCountryDraft(event.target.value)}
                placeholder="e.g. OLA"
                maxLength={16}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium text-foreground outline-none"
              />
            </span>
          </label>
          <button type="submit" className="min-h-11 self-end rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Apply
          </button>
        </form>
        {institutions.isError ? (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            Institution filters are currently unavailable. Public records can still be browsed without that filter.
            <button type="button" onClick={() => void institutions.refetch()} className="ml-2 min-h-11 font-semibold text-primary underline">Retry filter</button>
          </p>
        ) : null}

        <div role="group" aria-label="Membership term status" className="mt-5 flex flex-wrap gap-2">
          {([
            ["all", "All terms"],
            ["current", "Current terms"],
            ["ended", "Concluded terms"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={scope === key}
              onClick={() => {
                setScope(key);
                setPage(0);
              }}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground hover:text-foreground aria-[pressed=true]:bg-muted aria-[pressed=true]:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-7" aria-live="polite">
        {history.isPending ? (
          <div role="status" className="space-y-3">
            <p className="text-sm text-muted-foreground">Loading published membership records…</p>
            <div aria-hidden="true" className="space-y-3">
              {[0, 1, 2].map((item) =>
                <div key={item} className="h-24 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
              )}
            </div>
          </div>
        ) : null}

        {history.isError ? (
          <div role="alert" className="space-y-3 rounded-2xl border border-border p-6">
            <h2 className="text-lg font-semibold">Institutional history is unavailable</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              The official membership record or its publication-safe identity proof could not be verified. Nothing is shown from a private or guessed fallback.
            </p>
            <button type="button" onClick={() => void history.refetch()} className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold">
              Retry
            </button>
          </div>
        ) : null}

        {history.isSuccess && history.data.records.length === 0 ? (
          <div className="rounded-2xl border border-border p-6">
            <p className="font-semibold">No public membership terms match these filters.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              An empty history does not mean a country never participated in an institution. Unrecorded or unpublished activity is deliberately not inferred.
            </p>
            {page > 0 && history.data.total > 0 ? (
              <button type="button" className="mt-4 min-h-11 text-sm font-semibold text-primary underline" onClick={() => setPage(0)}>
                Return to first page
              </button>
            ) : null}
            {(organization || country || scope !== "all") ? (
              <button type="button" className="mt-4 min-h-11 text-sm font-semibold text-primary underline" onClick={() => {
                setCountryDraft(""); setCountry(""); setOrganization(""); setScope("all"); setPage(0);
              }}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}

        {history.isSuccess && history.data.records.length > 0 ? (
          <ol className="relative divide-y divide-border/60" aria-label="Published institutional membership terms">
            {history.data.records.map((entry) => (
              <li key={entry.id} className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.45fr)] sm:items-center">
                <div className="flex min-w-0 items-start gap-4">
                  <FlagChip
                    code={entry.country.code}
                    image={entry.country.flagImage}
                    color="#385A73"
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <Link to="/countries/$code" params={{ code: entry.country.code }} className="hover:text-primary hover:underline">
                        {entry.country.name}
                      </Link>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {entry.organization.shortName} · <span className="capitalize">{entry.type}</span>
                    </p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {entry.status} · {entry.endedAt ? "Concluded" : "Current"}
                    </p>
                  </div>
                </div>
                <div className="space-y-1 text-sm sm:text-right">
                  <p className="font-medium">Started {dateLabel(entry.joinedAt)}</p>
                  {entry.endedAt ? (
                    <p className="text-muted-foreground">Ended {dateLabel(entry.endedAt)}</p>
                  ) : (
                    <p className="inline-flex items-center gap-1 text-muted-foreground sm:justify-end">
                      <ShieldCheck aria-hidden="true" className="size-4" /> No end recorded
                    </p>
                  )}
                  <a
                    href={"/world/organizations/" + encodeURIComponent(entry.organization.slug)}
                    className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline sm:justify-end"
                  >
                    Institution <ArrowRight aria-hidden="true" className="size-4" />
                  </a>
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {history.isSuccess && total > 0 ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-sm text-muted-foreground">
            <span>
              Showing {page * WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE + 1}–{Math.min(total, (page + 1) * WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE)} of {total} public terms
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
                disabled={page >= 200 || (page + 1) * WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE >= total}
                onClick={() => setPage((current) => current + 1)}
                className="min-h-11 rounded-xl border border-border px-4 font-semibold text-foreground disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
        <p className="mt-6 max-w-3xl border-t border-border/60 pt-5 text-xs leading-6 text-muted-foreground">
          Membership status and dates come from official TG2 records. Country names and flags show current public identities; this screen does not yet reconstruct historical names or flags at the date a term began. No private institutional state is included.
        </p>
      </div>
    </section>
  );
}
