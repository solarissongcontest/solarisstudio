import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Landmark, UsersRound } from "lucide-react";

import { FlagChip } from "@/components/FlagChip";
import {
  currentWorldMemberships,
  currentWorldRepresentatives,
  loadWorldCountryIdentities,
  loadWorldOrganizationDetail,
  type WorldCountryIdentity,
  type WorldMembership,
  type WorldOrganizationDetail,
} from "@/lib/v3-world-public";

export type WorldOrganizationSection = "overview" | "leadership" | "members";

const SECTIONS: { id: WorldOrganizationSection; label: string; tail: string }[] = [
  { id: "overview", label: "Overview", tail: "" },
  { id: "leadership", label: "Leadership", tail: "/leadership" },
  { id: "members", label: "Members", tail: "/members" },
];

function DetailState({ title, message, action }: {
  title: string;
  message: string;
  action?: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface/60 p-6 text-center" role={action ? "alert" : "status"}>
      <h1 className="font-display text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {action ? <button type="button" onClick={action} className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold hover:border-primary/40">Try again</button> : null}
        <Link to={"/world/organizations" as never} className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm font-semibold hover:border-primary/40">Browse organizations</Link>
      </div>
    </div>
  );
}

function CountryIdentity({ identity }: { identity?: WorldCountryIdentity }) {
  if (!identity) return <span className="text-sm text-muted-foreground">Country identity unavailable</span>;
  return (
    <Link to={("/countries/" + encodeURIComponent(identity.shortCode)) as never}
      className="inline-flex min-h-11 items-center gap-2 font-medium hover:text-primary focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary">
      <FlagChip code={identity.shortCode} color={identity.accentColor} image={identity.flagImage} size="sm" />
      <span>{identity.name}</span>
    </Link>
  );
}

function OfficeLine({ title, holder, country, method, termLength }: {
  title: string;
  holder: string | null;
  country?: WorldCountryIdentity;
  method: string;
  termLength: number | null;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/70 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-base font-medium">{holder ?? "No active holder recorded"}</p>
        {country ? <div className="mt-1 text-xs text-muted-foreground"><CountryIdentity identity={country} /></div> : null}
      </div>
      <div className="shrink-0 text-xs leading-5 text-muted-foreground sm:text-right">
        {method ? <p className="capitalize">{method.replace(/_/g, " ")}</p> : null}
        {termLength !== null ? <p>Standard term: {termLength} SSC {termLength === 1 ? "edition" : "editions"}</p> : null}
      </div>
    </div>
  );
}

function WorldOverview({ detail, countries }: {
  detail: WorldOrganizationDetail;
  countries: Map<string, WorldCountryIdentity>;
}) {
  const offices = detail.offices.slice(0, 2);
  const members = currentWorldMemberships(detail);
  return (
    <div className="space-y-8">
      <section aria-labelledby="world-about-heading">
        <h2 id="world-about-heading" className="font-display text-xl font-bold">About this institution</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          {detail.organization.description || "No official public summary has been provided for this institution."}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4 border-y border-border/70 py-4 sm:max-w-xl">
          <div><p className="text-xs text-muted-foreground">Current recorded memberships</p><p className="mt-1 text-2xl font-semibold tabular-nums">{members.length}</p></div>
          <div><p className="text-xs text-muted-foreground">Public organs</p><p className="mt-1 text-2xl font-semibold tabular-nums">{detail.organs.length}</p></div>
        </div>
      </section>

      <section aria-labelledby="world-leadership-preview">
        <div className="flex items-end justify-between gap-3">
          <h2 id="world-leadership-preview" className="font-display text-xl font-bold">Leadership</h2>
          <Link to={("/world/organizations/" + detail.organization.slug + "/leadership") as never}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">
            All offices <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {offices.length ? (
          <div className="mt-2 border-t border-border/70">
            {offices.map((office) => <OfficeLine key={office.id} title={office.title}
              holder={office.currentTerm?.holderDisplayName ?? null}
              country={countries.get(office.currentTerm?.representedCountryId ?? "")}
              method={office.appointmentMethod} termLength={office.termLengthEditions} />)}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">No public offices are configured yet.</p>}
      </section>

      <section aria-labelledby="world-organs-heading">
        <h2 id="world-organs-heading" className="font-display text-xl font-bold">Institutional bodies</h2>
        {detail.organs.length ? (
          <div className="mt-3 divide-y divide-border/70 border-t border-border/70">
            {detail.organs.slice(0, 4).map((organ) => (
              <div key={organ.id} className="flex gap-3 py-4">
                <Building2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                <div><p className="text-sm font-semibold">{organ.name}</p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">{organ.type.replace(/_/g, " ")} · {organ.status}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">No public institutional bodies are recorded.</p>}
      </section>

      <Link to={("/world/organizations/" + detail.organization.slug + "/members") as never}
        className="group flex min-h-24 items-center justify-between gap-4 rounded-xl border border-border bg-surface/60 p-5 hover:border-primary/40">
        <span><strong className="block">Member countries</strong>
          <span className="mt-1 block text-sm text-muted-foreground">Explore current members, observers and representatives.</span>
        </span>
        <UsersRound aria-hidden="true" className="size-6 shrink-0 text-primary transition group-hover:translate-x-1" />
      </Link>
    </div>
  );
}

function WorldLeadership({ detail, countries }: {
  detail: WorldOrganizationDetail;
  countries: Map<string, WorldCountryIdentity>;
}) {
  return (
    <section aria-labelledby="world-leadership-heading">
      <div className="flex items-start gap-3">
        <Landmark aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" />
        <div>
          <h2 id="world-leadership-heading" className="font-display text-2xl font-bold">Institutional leadership</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            These are public offices and their current recorded holders. Vacancies remain vacancies.
            Standard term lengths use SSC editions, not real-world calendar years.
          </p>
        </div>
      </div>
      {detail.offices.length ? (
        <div className="mt-6 divide-y divide-border border-y border-border">
          {detail.offices.map((office) => (
            <OfficeLine key={office.id} title={office.title}
              holder={office.currentTerm?.holderDisplayName ?? null}
              country={countries.get(office.currentTerm?.representedCountryId ?? "")}
              method={office.appointmentMethod} termLength={office.termLengthEditions} />
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          This organization has no published offices yet.
        </p>
      )}
      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        Historical office timelines require the separate publication-safe history projection. No former officeholders are inferred from current accounts.
      </p>
    </section>
  );
}

function WorldMembers({ detail, countries, identityError, retryIdentities }: {
  detail: WorldOrganizationDetail;
  countries: Map<string, WorldCountryIdentity>;
  identityError: boolean;
  retryIdentities: () => void;
}) {
  const [visible, setVisible] = useState(20);
  const memberships = useMemo(() => currentWorldMemberships(detail).sort((a, b) => {
    const left = countries.get(a.countryId)?.name ?? a.countryId;
    const right = countries.get(b.countryId)?.name ?? b.countryId;
    return left.localeCompare(right);
  }), [detail, countries]);
  const representatives = new Map(currentWorldRepresentatives(detail).map((person) => [person.countryId, person]));
  const displayed = memberships.slice(0, visible);

  return (
    <section aria-labelledby="world-members-heading">
      <h2 id="world-members-heading" className="font-display text-2xl font-bold">Member countries</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Current official membership records, including suspended members and observers. The country links use present-day public identity; historical names are not reconstructed here.
      </p>
      {identityError ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm">Country labels are temporarily unavailable. Membership status is still shown.</p>
          <button type="button" onClick={retryIdentities} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Retry labels</button>
        </div>
      ) : null}
      {displayed.length ? (
        <>
          <div className="mt-5 divide-y divide-border border-y border-border">
            {displayed.map((membership: WorldMembership) => (
              <div key={membership.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem] sm:items-center sm:gap-4">
                <div className="min-w-0"><CountryIdentity identity={countries.get(membership.countryId)} /></div>
                <div className="text-sm text-muted-foreground">
                  {representatives.get(membership.countryId)
                    ? <><span className="block text-xs">Representative</span><span className="font-medium text-foreground">{representatives.get(membership.countryId)?.displayName}</span></>
                    : <span className="text-xs">No current voting representative recorded</span>}
                </div>
                <div className="text-xs font-medium capitalize text-muted-foreground sm:text-right">
                  {membership.status.replace(/_/g, " ")}
                </div>
              </div>
            ))}
          </div>
          {memberships.length > displayed.length ? (
            <button type="button" onClick={() => setVisible((count) => count + 20)}
              className="mt-5 min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:border-primary/40">
              Show more members ({memberships.length - displayed.length} remaining)
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          No current memberships are recorded. This does not mean countries have been denied admission.
        </p>
      )}
    </section>
  );
}

export function WorldOrganizationScreen({ slug, section }: {
  slug: string;
  section: WorldOrganizationSection;
}) {
  const detailQuery = useQuery({
    queryKey: ["v3-world-organization", slug.toLowerCase()],
    queryFn: () => loadWorldOrganizationDetail(slug),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const detail = detailQuery.data;
  const countryIds = useMemo(() => {
    if (!detail) return [];
    return [
      ...new Set([
        ...currentWorldMemberships(detail).map((member) => member.countryId),
        ...detail.offices.map((office) => office.currentTerm?.representedCountryId).filter((id): id is string => Boolean(id)),
      ]),
    ];
  }, [detail]);
  const countriesQuery = useQuery({
    queryKey: ["v3-world-country-identities", countryIds.slice().sort().join(",")],
    queryFn: () => loadWorldCountryIdentities(countryIds),
    enabled: Boolean(detail) && countryIds.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const countries = useMemo(() => new Map((countriesQuery.data ?? []).map((item) => [item.id, item])), [countriesQuery.data]);

  if (detailQuery.isPending) return <DetailState title="Opening Terra Solaris institution" message="Loading the canonical public institution record…" />;
  if (detailQuery.isError) return <DetailState title="Institution temporarily unavailable" message="The public governance record could not be loaded safely. Please try again." action={() => void detailQuery.refetch()} />;
  if (!detail) return <DetailState title="Organization not found" message="There is no public institution at this address. Private or unknown organizations are not disclosed." />;

  const basePath = "/world/organizations/" + encodeURIComponent(detail.organization.slug);
  return (
    <div className="mx-auto w-full max-w-6xl pb-12">
      <Link to={"/world/organizations" as never} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
        <ArrowLeft aria-hidden="true" className="size-4" /> All organizations
      </Link>
      <header className="mt-2 border-b border-border pb-6 sm:pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{detail.organization.shortName}</span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs capitalize text-muted-foreground">{detail.organization.status}</span>
        </div>
        <h1 className="mt-3 max-w-4xl font-display text-3xl font-bold tracking-tight sm:text-5xl">
          {detail.organization.officialName}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{detail.organization.description}</p>
      </header>
      <nav aria-label="Organization sections" className="my-6 flex gap-1 overflow-x-auto border-b border-border">
        {SECTIONS.map((item) => (
          <Link key={item.id} to={(basePath + item.tail) as never}
            aria-current={section === item.id ? "page" : undefined}
            className={"inline-flex min-h-12 shrink-0 items-center border-b-2 px-4 text-sm font-semibold transition " +
              (section === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-primary")}>
            {item.label}
          </Link>
        ))}
      </nav>
      {section === "overview" ? <WorldOverview detail={detail} countries={countries} /> : null}
      {section === "leadership" ? <WorldLeadership detail={detail} countries={countries} /> : null}
      {section === "members" ? (
        <WorldMembers detail={detail} countries={countries}
          identityError={countriesQuery.isError}
          retryIdentities={() => void countriesQuery.refetch()} />
      ) : null}
    </div>
  );
}
