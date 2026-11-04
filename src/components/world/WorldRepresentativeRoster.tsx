import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Flag, Search, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { readPublicWorldRepresentatives } from "@/lib/world-representative-roster-data";
import {
  normalizedWorldRepresentativeSearch,
  validWorldOrganizationSlug,
  type WorldRepresentative,
  type WorldRepresentativeFilter,
} from "@/lib/world-representative-roster";
import { V3Screen, V3ScreenHeader, V3Section } from "@/components/v3/V3Foundation";

const FILTERS: readonly { value: WorldRepresentativeFilter; title: string }[] = [
  { value: "current", title: "Current" },
  { value: "past", title: "Former" },
  { value: "all", title: "All terms" },
];

function PublicState({ title, detail, retry }: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return <section className="rounded-2xl border border-border/70 bg-surface/35 px-5 py-10 text-center">
    <UsersRound aria-hidden="true" className="mx-auto size-7 text-muted-foreground" />
    <h2 className="mt-3 text-lg font-semibold">{title}</h2>
    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{detail}</p>
    {retry ? <button type="button" onClick={retry}
      className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/50">Try again</button> : null}
  </section>;
}

function publicDate(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function RepresentativeRow({ record }: { record: WorldRepresentative }) {
  return <article className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-5">
    <div className="flex min-w-0 items-center gap-3">
      {record.countryFlagUrl ?
        <img src={record.countryFlagUrl} alt="" loading="lazy"
          className="aspect-[3/2] h-10 w-[60px] shrink-0 rounded-md border border-border/60 object-cover" /> :
        <span aria-hidden="true" className="grid h-10 w-[60px] shrink-0 place-items-center rounded-md border border-border/60 bg-surface">
          <Flag className="size-4 text-muted-foreground" />
        </span>}
      <div className="min-w-0">
        <p className="truncate font-semibold">{record.displayName}</p>
        <Link to={("/countries/" + encodeURIComponent(record.countryCode)) as any}
          className="mt-1 inline-block min-h-8 text-sm text-muted-foreground hover:text-primary hover:underline">
          {record.countryName}
        </Link>
      </div>
    </div>
    <div className="min-w-0 space-y-1 text-sm sm:text-right">
      <p className="font-semibold">{record.role}</p>
      <p className="text-muted-foreground">
        {record.endsAt ? "Former" : "Current"} · {record.votingAuthority ? "Voting representative" : "Non-voting representative"}
      </p>
      <p className="text-xs text-muted-foreground">
        {publicDate(record.startsAt)} to {record.endsAt ? publicDate(record.endsAt) : "present"}
      </p>
    </div>
  </article>;
}

export function WorldRepresentativeRoster({ slug }: { slug: string }) {
  const [filter, setFilter] = useState<WorldRepresentativeFilter>("current");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const valid = validWorldOrganizationSlug(slug);

  const query = useQuery({
    queryKey: ["terra-world", "representatives", slug, filter, search, page],
    queryFn: () => readPublicWorldRepresentatives({ slug, filter, search, page }),
    enabled: valid,
    staleTime: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(normalizedWorldRepresentativeSearch(draft));
    setPage(0);
  };

  return <V3Screen className="pb-10">
    <Link to={("/world/organizations/" + encodeURIComponent(slug)) as any}
      className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
      <ArrowLeft aria-hidden="true" className="size-4" /> Institution profile
    </Link>
    <V3ScreenHeader kicker="Terra Solaris · Institutions" title="Representatives"
      description="Published country representatives and their recorded terms. Personal login accounts, proxy approvals and private institutional work remain outside this directory." />

    {!valid ? <PublicState title="Invalid organization address" detail="The requested institution address is not valid." /> :
      query.isPending ? <p role="status" aria-live="polite" className="py-12 text-center text-sm text-muted-foreground">Loading published representatives…</p> :
      query.isError ? <PublicState title="Representatives unavailable"
        detail="The public institutional roster could not be verified. Private records are not substituted."
        retry={() => void query.refetch()} /> :
      query.data === null ? <PublicState title="Institution not found"
        detail="No published institution exists at this address." /> :
      <>
        <header className="mb-6 border-b border-border/70 pb-4">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{query.data.organizationName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Current and completed representative terms, from the official institutional register.</p>
        </header>

        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Representative term status">
          {FILTERS.map((option) => <button type="button" key={option.value}
            aria-pressed={filter === option.value}
            onClick={() => { setFilter(option.value); setPage(0); }}
            className={"min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors " +
              (filter === option.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            {option.title}
          </button>)}
        </div>

        <form role="search" onSubmit={onSearch} className="mb-7 flex max-w-xl gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Find representative or country</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={64}
              placeholder="Representative or country"
              className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm text-foreground" />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Search</button>
        </form>

        <V3Section title={filter === "current" ? "Current representatives" :
          filter === "past" ? "Former representatives" : "Recorded representatives"}
          meta={query.data.total + " recorded"}>
          {query.data.rows.length === 0 ?
            <PublicState title="No representatives in this view"
              detail={search ? "Try a different name or country search." :
                "No matching representative terms have been recorded. Solaris does not invent current appointees."} /> :
            <div className="divide-y divide-border/70">
              {query.data.rows.map((item) => <RepresentativeRow key={item.id} record={item} />)}
            </div>}
          {(page > 0 || query.data.hasMore) ? <nav aria-label="Representative pages"
            className="mt-6 flex items-center justify-between gap-3 border-t border-border/70 pt-5">
            <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-40">
              <ArrowLeft aria-hidden="true" className="size-4" /> Previous
            </button>
            <span className="text-xs tabular-nums text-muted-foreground">Page {page + 1}</span>
            <button type="button" disabled={!query.data.hasMore} onClick={() => setPage((value) => value + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-40">
              Next <ArrowRight aria-hidden="true" className="size-4" />
            </button>
          </nav> : null}
          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            Country names and flags show the currently published country identity, not a reconstructed historical flag.
            Officeholders and temporary proxies are governed separately.
          </p>
        </V3Section>
      </>}
  </V3Screen>;
}
