import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Landmark, Users } from "lucide-react";
import { useState } from "react";

import { getTerraWorldOrganization } from "@/lib/terra-world-public.functions";
import {
  WORLD_MEMBERS_PAGE_SIZE,
  currentWorldMemberships,
  currentWorldRepresentatives,
  type WorldCountryIdentity,
  type WorldMembership,
  type WorldOrganizationDetail,
} from "@/lib/terra-world-public";

export type WorldOrganizationSection = "overview" | "leadership" | "members";

function CountryIdentity({ id, countries }: { id: string; countries: WorldCountryIdentity[] }) {
  const country = countries.find((entry) => entry.id === id);
  if (!country) return <span className="text-muted-foreground">Country identity unavailable</span>;
  return (
    <Link to="/countries/$code" params={{ code: country.code }} className="inline-flex min-h-11 items-center gap-3 font-medium hover:text-primary hover:underline">
      {country.flagImage ? (
        <img src={country.flagImage} alt="" loading="lazy" className="h-8 w-12 shrink-0 rounded-sm border border-border object-cover" />
      ) : (
        <span aria-hidden="true" className="grid h-8 w-12 shrink-0 place-items-center rounded-sm border border-border bg-muted text-xs">{country.code.slice(0, 2)}</span>
      )}
      {country.name}
    </Link>
  );
}
function MemberRow({ membership, detail }: { membership: WorldMembership; detail: WorldOrganizationDetail }) {
  const representative = currentWorldRepresentatives(detail).find((entry) => entry.countryId === membership.countryId);
  return (
    <li className="flex flex-col gap-2 border-b border-border/60 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0">
        <CountryIdentity id={membership.countryId} countries={detail.countries} />
        <span className="block text-xs capitalize text-muted-foreground">{membership.membershipType} · {membership.status}</span>
      </span>
      {representative ? <span className="text-sm text-muted-foreground">{representative.displayName}</span> : <span className="text-xs text-muted-foreground">No public representative listed</span>}
    </li>
  );
}
function SectionLink({ slug, label, section }: { slug: string; label: string; section: WorldOrganizationSection }) {
  const to = section === "overview" ? "/world/organizations/$slug/" :
    section === "leadership" ? "/world/organizations/$slug/leadership" : "/world/organizations/$slug/members";
  return (
    <Link to={to} params={{ slug }} activeOptions={{ exact: true }} activeProps={{ "aria-current": "page" }}
      className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground">
      {label}
    </Link>
  );
}
function Overview({ detail }: { detail: WorldOrganizationDetail }) {
  const currentMembers = currentWorldMemberships(detail);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.35fr)]">
      <div className="space-y-9">
        <section aria-labelledby="world-about">
          <h2 id="world-about" className="text-xl font-semibold">About the organization</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{detail.organization.description ?? "No public mission statement has been published."}</p>
        </section>
        <section aria-labelledby="world-organs">
          <h2 id="world-organs" className="text-xl font-semibold">Institutional bodies</h2>
          {detail.organs.length ? (
            <ul className="mt-3 divide-y divide-border/60">
              {detail.organs.slice(0, 5).map((organ) =>
                <li className="flex items-center gap-3 py-3" key={organ.id}>
                  <Landmark aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <div><p className="font-medium">{organ.name}</p><p className="text-xs capitalize text-muted-foreground">{organ.type.replaceAll("_", " ")}</p></div>
                </li>,
              )}
            </ul>
          ) : <p className="mt-3 text-sm text-muted-foreground">No public institutional bodies listed.</p>}
        </section>
        <section aria-labelledby="world-leadership-preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="world-leadership-preview" className="text-xl font-semibold">Leadership</h2>
            <Link to="/world/organizations/$slug/leadership" params={{ slug: detail.organization.slug }} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">All offices <ArrowRight aria-hidden="true" className="size-4" /></Link>
          </div>
          <ul className="mt-2 divide-y divide-border/60">
            {detail.offices.slice(0, 3).map((office) =>
              <li key={office.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm font-medium">{office.title}</span>
                <span className="text-sm text-muted-foreground">{office.currentTerm?.holderDisplayName ?? "No confirmed holder"}</span>
              </li>,
            )}
          </ul>
          {!detail.offices.length ? <p className="mt-3 text-sm text-muted-foreground">No public office structure available.</p> : null}
        </section>
      </div>
      <aside className="space-y-6 border-t border-border/60 pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current members</p>
          <p className="text-4xl font-semibold tabular-nums">{currentMembers.length}</p>
          <Link to="/world/organizations/$slug/members" params={{ slug: detail.organization.slug }} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">
            <Users aria-hidden="true" className="size-4" /> View membership <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <p className="text-xs leading-6 text-muted-foreground">Memberships and officeholders come from published institutional state. Informal statements and unconfirmed historical identities are not presented as facts.</p>
      </aside>
    </div>
  );
}
function Leadership({ detail }: { detail: WorldOrganizationDetail }) {
  const representatives = currentWorldRepresentatives(detail);
  return (
    <div className="space-y-10">
      <section aria-labelledby="world-offices">
        <h2 id="world-offices" className="text-xl font-semibold">Current offices</h2>
        {detail.offices.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {detail.offices.map((office) =>
              <li className="rounded-2xl border border-border/70 p-5" key={office.id}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{office.title}</p>
                <p className="mt-3 text-lg font-semibold">{office.currentTerm?.holderDisplayName ?? "No confirmed officeholder"}</p>
                {office.currentTerm?.representedCountryId ? (
                  <div className="mt-2 text-sm"><CountryIdentity id={office.currentTerm.representedCountryId} countries={detail.countries} /></div>
                ) : null}
                {office.currentTerm ? <p className="mt-2 text-xs capitalize text-muted-foreground">{office.currentTerm.termKind} term</p> : null}
                {office.successionPolicy ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{office.successionPolicy}</p> : null}
              </li>,
            )}
          </ul>
        ) : <p className="mt-3 text-sm text-muted-foreground">No public offices have been configured.</p>}
      </section>
      <section aria-labelledby="world-reps">
        <h2 id="world-reps" className="text-xl font-semibold">Current representatives</h2>
        {representatives.length ? (
          <ul className="mt-3 divide-y divide-border/60">
            {representatives.map((representative) =>
              <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={representative.id}>
                <span className="font-semibold">{representative.displayName}</span>
                <CountryIdentity id={representative.countryId} countries={detail.countries} />
              </li>,
            )}
          </ul>
        ) : <p className="mt-3 text-sm text-muted-foreground">No current representatives have been publicly confirmed.</p>}
      </section>
      <p className="text-xs leading-6 text-muted-foreground">A complete historical office-term timeline will appear when the institutional Archive projection is available. Current office titles do not imply an appointed holder.</p>
    </div>
  );
}
function Members({ detail }: { detail: WorldOrganizationDetail }) {
  const [filter, setFilter] = useState<"current" | "former">("current");
  const [visibleCount, setVisibleCount] = useState(WORLD_MEMBERS_PAGE_SIZE);
  const memberships = filter === "current" ? currentWorldMemberships(detail) :
    detail.memberships.filter((member) => member.endedAt !== null);
  const visible = memberships.slice(0, visibleCount);
  return (
    <section aria-labelledby="world-member-list">
      <h2 id="world-member-list" className="text-xl font-semibold">Membership</h2>
      <p className="mt-2 text-sm text-muted-foreground">Current membership and historical changes are separate. No country is assumed to belong to an organization without a canonical membership record.</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Membership history">
        {(["current", "former"] as const).map((value) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setVisibleCount(WORLD_MEMBERS_PAGE_SIZE); }}
            className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold capitalize aria-[pressed=true]:bg-muted">
            {value === "current" ? "Current" : "Former"}
          </button>,
        )}
      </div>
      {memberships.length ? (
        <>
          <ul className="mt-4 divide-y divide-border/60">
            {visible.map((membership) => <MemberRow key={membership.id} membership={membership} detail={detail} />)}
          </ul>
          {visibleCount < memberships.length ? (
            <button type="button" className="mt-5 min-h-11 rounded-xl border border-border px-5 text-sm font-semibold" onClick={() => setVisibleCount((count) => count + WORLD_MEMBERS_PAGE_SIZE)}>
              Show more ({memberships.length - visibleCount} remaining)
            </button>
          ) : null}
        </>
      ) : <p className="mt-5 text-sm text-muted-foreground">No {filter} membership records are public for this organization.</p>}
    </section>
  );
}

export function TerraWorldOrganizationView({ slug, section }: { slug: string; section: WorldOrganizationSection }) {
  const load = useServerFn(getTerraWorldOrganization);
  const query = useQuery({
    queryKey: ["terra-world", "organization", slug],
    queryFn: () => load({ data: { slug } }),
    staleTime: 2 * 60_000,
    retry: 1,
  });
  if (query.isPending) return <div role="status" className="py-10 text-sm text-muted-foreground">Loading published institutional information…</div>;
  if (query.isError) return (
    <div role="alert" className="space-y-3 rounded-2xl border border-border p-6">
      <h1 className="text-2xl font-semibold">Institutional information is unavailable</h1>
      <p className="text-sm text-muted-foreground">The public institution service could not verify the information. No unverified content is displayed.</p>
      <button type="button" className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold" onClick={() => void query.refetch()}>Retry</button>
    </div>
  );
  const detail = query.data;
  if (!detail) return (
    <section className="space-y-4 py-10">
      <h1 className="text-2xl font-semibold">Organization not found</h1>
      <p className="text-sm text-muted-foreground">No public organization exists at this address.</p>
      <Link to="/world/organizations/" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Back to organizations</Link>
    </section>
  );
  const organization = detail.organization;
  return (
    <div>
      <Link to="/world/organizations/" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft aria-hidden="true" className="size-4" /> Organizations</Link>
      <header className="mb-7 border-b border-border/60 pb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Terra Solaris · International institutions</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {organization.emblemUrl ? <img alt="" src={organization.emblemUrl} className="size-16 rounded-2xl border border-border bg-surface object-contain p-2" /> : null}
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{organization.shortName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{organization.officialName}</p>
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{organization.status} · {organization.type.replaceAll("_", " ")}</p>
      </header>
      <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-border/60 pb-2" aria-label="Organization sections">
        <SectionLink slug={slug} label="Overview" section="overview" />
        <SectionLink slug={slug} label="Leadership" section="leadership" />
        <SectionLink slug={slug} label="Members" section="members" />
      </nav>
      {section === "overview" ? <Overview detail={detail} /> :
        section === "leadership" ? <Leadership detail={detail} /> :
        <Members detail={detail} />}
    </div>
  );
}
