import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Building2, ChevronRight, Globe2, Search, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import { AppEmptyState, AppSectionHeader } from '@/components/app/AppPrimitives';
import { FlagChip } from '@/components/FlagChip';
import { useCountries } from '@/lib/data';
import { solarisQueryPolicy } from '@/lib/app-query-policy';
import { readWorldOrganizationProfile, readWorldOrganizationsPage } from '@/lib/terra-world-public-data';
import {
  currentWorldMemberships,
  currentWorldRepresentatives,
  worldOrgStatusLabel,
  WORLD_ORG_STATUSES,
  type PublicWorldOrganization,
  type PublicWorldProfile,
  type WorldOrgFilter,
} from '@/lib/terra-world-public';

function useDirectory(search = '', status: WorldOrgFilter = 'all') {
  return useInfiniteQuery({
    queryKey: ['terra-world-public-organizations', search, status],
    queryFn: ({ pageParam }) => readWorldOrganizationsPage({ page: pageParam, search, status }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    retry: 1,
    ...solarisQueryPolicy('warm'),
  });
}

function WorldError({ onRetry }: { onRetry: () => void }) {
  return (
    <AppEmptyState
      title="Terra Solaris is temporarily unavailable"
      description="We could not verify the public institutional record. No historical or official information has been guessed."
      action={<button type="button" onClick={onRetry} className="solaris-app-empty-action">Try again</button>}
    />
  );
}

function WorldLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-6" data-v3-world-loading="">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="h-16 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
      <div className="h-16 animate-pulse rounded-xl bg-muted/30 motion-reduce:animate-none" />
    </div>
  );
}

function WorldOrgRow({ org }: { org: PublicWorldOrganization }) {
  return (
    <Link
      to="/world/organizations/$slug"
      params={{ slug: org.slug }}
      className="group flex min-h-20 items-center gap-4 border-b border-border/70 py-4 focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface">
        {org.emblemUrl ? <img src={org.emblemUrl} alt="" loading="lazy" className="h-full w-full object-contain p-1" /> : <Building2 className="size-5 text-muted-foreground" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{org.shortName}</span>
        <span className="block text-sm text-muted-foreground">{org.officialName === org.shortName ? org.type.replaceAll('_', ' ') : org.officialName}</span>
        {org.description ? <span className="mt-1 block line-clamp-2 text-sm leading-5 text-muted-foreground">{org.description}</span> : null}
      </span>
      <span className="hidden shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline">
        {worldOrgStatusLabel(org.status)}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
    </Link>
  );
}

export function V3WorldLandingScreen() {
  const directory = useDirectory();
  const featured = (directory.data?.pages[0]?.items ?? [])
    .filter((org) => org.slug === 'guard' || org.slug === 'unity')
    .sort((a, b) => ['guard', 'unity'].indexOf(a.slug) - ['guard', 'unity'].indexOf(b.slug));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-28 pt-6 sm:px-6 sm:pt-10" data-v3-world-home="">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Beyond the contest</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-6xl">Terra Solaris</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          The institutions and countries of the wider Solaris world. Explore public institutional records, leadership and membership without confusing roleplay with official history.
        </p>
      </header>

      <section aria-labelledby="world-organizations-heading">
        <AppSectionHeader
          id="world-organizations-heading"
          eyebrow="World institutions"
          title="Organizations"
          trailing={<Link to="/world/organizations" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">View all <ArrowRight className="size-4" aria-hidden="true" /></Link>}
        />
        {directory.isPending ? <WorldLoading label="Loading public organizations…" /> :
          directory.isError ? <WorldError onRetry={() => void directory.refetch()} /> :
          featured.length ? (
            <div className="mt-4 grid gap-x-10 sm:grid-cols-2">
              {featured.map((org) => <WorldOrgRow key={org.id} org={org} />)}
            </div>
          ) : (
            <AppEmptyState title="No featured institutions published" description="Official organizations will appear here when their public records are available." />
          )}
      </section>

      <section aria-labelledby="world-discover-heading">
        <AppSectionHeader id="world-discover-heading" eyebrow="Discover" title="Countries and institutions" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link to="/countries" className="flex min-h-28 items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/40">
            <Globe2 className="size-7 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex-1"><strong className="block text-base">Countries</strong><span className="mt-1 block text-sm text-muted-foreground">Explore sovereign states and their public profiles.</span></span>
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
          <Link to="/world/organizations" className="flex min-h-28 items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/40">
            <Users className="size-7 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex-1"><strong className="block text-base">Institutional directory</strong><span className="mt-1 block text-sm text-muted-foreground">Browse recognized unions and other public organizations.</span></span>
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <p className="text-sm text-muted-foreground">
        Formal proposals, statements, the Court and world-history timelines will appear only when their authoritative published projections exist.
      </p>
    </div>
  );
}

export function V3WorldOrganizationsDirectoryScreen() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WorldOrgFilter>('all');
  const directory = useDirectory(search, status);
  const organizations = directory.data?.pages.flatMap((page) => page.items) ?? [];
  const visible = useMemo(() => {
    const seen = new Set<string>();
    return organizations.filter((org) => {
      if (seen.has(org.id)) return false;
      seen.add(org.id);
      return true;
    });
  }, [organizations]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 px-4 pb-28 pt-6 sm:px-6 sm:pt-10" data-v3-world-directory="">
      <Link to="/world" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Terra Solaris</Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Institutions</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Organizations</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Browse public records of the organizations of Terra Solaris. Private or unpublished institutions are not included.</p>
      </header>

      <form role="search" onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1.5 block text-sm font-medium">Search organizations</span>
          <span className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
              maxLength={64} placeholder="Name or abbreviation" className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none" />
          </span>
        </label>
        <label className="sm:w-48">
          <span className="mb-1.5 block text-sm font-medium">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as WorldOrgFilter)}
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm">
            <option value="all">All statuses</option>
            {WORLD_ORG_STATUSES.map((value) => <option key={value} value={value}>{worldOrgStatusLabel(value)}</option>)}
          </select>
        </label>
        <button type="submit" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Search</button>
      </form>

      {directory.isPending ? <WorldLoading label="Finding published organizations…" /> :
        directory.isError ? <WorldError onRetry={() => void directory.refetch()} /> :
        <section aria-labelledby="world-directory-results">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="world-directory-results" className="text-xl font-bold">Directory</h2>
            <span aria-live="polite" className="text-xs text-muted-foreground">{visible.length} loaded</span>
          </div>
          {visible.length ? <div className="mt-3">{visible.map((org) => <WorldOrgRow key={org.id} org={org} />)}</div> :
            <AppEmptyState title="No public organizations found" description="Try a different search or status. Private organizations are never shown in public discovery."
              action={<button type="button" className="solaris-app-empty-action" onClick={() => { setSearchInput(''); setSearch(''); setStatus('all'); }}>Clear filters</button>} />}
          {directory.hasNextPage ? (
            <button type="button" disabled={directory.isFetchingNextPage} onClick={() => void directory.fetchNextPage()}
              className="mt-5 min-h-11 w-full rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-60">
              {directory.isFetchingNextPage ? 'Loading more…' : 'Load more organizations'}
            </button>
          ) : null}
        </section>
      }
    </div>
  );
}

type ProfileTab = 'overview' | 'leadership' | 'members';

export function V3WorldOrganizationProfileScreen({ slug }: { slug: string }) {
  const [tab, setTab] = useState<ProfileTab>('overview');
  const profileQuery = useQuery({
    queryKey: ['terra-world-organization-projection', slug],
    queryFn: () => readWorldOrganizationProfile(slug),
    retry: 1,
    ...solarisQueryPolicy('warm'),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7 px-4 pb-28 pt-6 sm:px-6 sm:pt-10" data-v3-world-organization={slug}>
      <nav aria-label="World organization breadcrumbs" className="flex flex-wrap items-center gap-2 text-sm">
        <Link to="/world" className="min-h-11 content-center text-primary">Terra Solaris</Link>
        <span aria-hidden="true">/</span>
        <Link to="/world/organizations" className="min-h-11 content-center text-primary">Organizations</Link>
      </nav>
      {profileQuery.isPending ? <WorldLoading label="Opening institutional record…" /> :
        profileQuery.isError ? <WorldError onRetry={() => void profileQuery.refetch()} /> :
        !profileQuery.data ? <AppEmptyState title="Organization not found" description="There is no published organization under this address."
          action={<Link to="/world/organizations" className="solaris-app-empty-action">Browse public organizations</Link>} /> :
        <>
          <header className="max-w-4xl">
            {profileQuery.data.organization.bannerUrl ?
              <img src={profileQuery.data.organization.bannerUrl} alt="" className="mb-5 max-h-64 w-full rounded-2xl object-cover" /> : null}
            <div className="flex items-start gap-4">
              {profileQuery.data.organization.emblemUrl ?
                <img src={profileQuery.data.organization.emblemUrl} alt="" className="size-16 shrink-0 rounded-xl border border-border object-contain p-1" /> :
                <span className="grid size-16 shrink-0 place-items-center rounded-xl border border-border bg-surface"><Building2 className="size-7" aria-hidden="true" /></span>}
              <div className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">{worldOrgStatusLabel(profileQuery.data.organization.status)} institution</span>
                <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-5xl">{profileQuery.data.organization.shortName}</h1>
                {profileQuery.data.organization.officialName !== profileQuery.data.organization.shortName ?
                  <p className="mt-1 text-base text-muted-foreground">{profileQuery.data.organization.officialName}</p> : null}
              </div>
            </div>
            {profileQuery.data.organization.description ?
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{profileQuery.data.organization.description}</p> : null}
          </header>

          <div role="tablist" aria-label="Organization sections" className="flex gap-1 overflow-x-auto border-b border-border">
            {(['overview', 'leadership', 'members'] as const).map((section) => (
              <button key={section} type="button" role="tab" id={'world-tab-' + section}
                aria-selected={tab === section} aria-controls="world-organization-tabpanel"
                onClick={() => setTab(section)}
                className={'min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ' +
                  (tab === section ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {section}
              </button>
            ))}
          </div>
          <section role="tabpanel" id="world-organization-tabpanel" aria-labelledby={'world-tab-' + tab} className="min-h-48">
            {tab === 'overview' ? <WorldOverview profile={profileQuery.data} onTab={setTab} /> :
              tab === 'members' ? <WorldMembers profile={profileQuery.data} /> :
              <WorldLeadership profile={profileQuery.data} />}
          </section>
        </>
      }
    </div>
  );
}

function WorldOverview({ profile, onTab }: { profile: PublicWorldProfile; onTab: (tab: ProfileTab) => void }) {
  const members = currentWorldMemberships(profile);
  const filledOffices = profile.offices.filter((office) => office.currentHolder);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-9">
        <section aria-labelledby="world-org-leaders">
          <AppSectionHeader eyebrow="Institution" title="Leadership" id="world-org-leaders" />
          {filledOffices.length ? <div className="mt-3 divide-y divide-border">
            {filledOffices.slice(0, 3).map((office) => <div key={office.id} className="flex flex-wrap justify-between gap-2 py-4 text-sm">
              <span className="text-muted-foreground">{office.title}</span>
              <strong>{office.currentHolder}</strong>
            </div>)}
          </div> : <p className="mt-3 text-sm text-muted-foreground">No current officeholders have been officially recorded.</p>}
          <button type="button" onClick={() => onTab('leadership')} className="mt-2 min-h-11 text-sm font-semibold text-primary">Leadership details <span aria-hidden="true">→</span></button>
        </section>
        <section aria-labelledby="world-org-bodies">
          <AppSectionHeader eyebrow="Structure" title="Public bodies" id="world-org-bodies" />
          {profile.organs.length ? <ul className="mt-3 divide-y divide-border">
            {profile.organs.slice(0, 4).map((organ) => <li key={organ.id} className="py-3">
              <strong className="text-sm">{organ.name}</strong>
              <span className="mt-1 block text-xs text-muted-foreground">{organ.type.replaceAll('_', ' ')}</span>
            </li>)}
          </ul> : <p className="mt-3 text-sm text-muted-foreground">No public bodies are listed.</p>}
        </section>
      </div>
      <aside className="space-y-4 lg:border-l lg:border-border lg:pl-6">
        <h2 className="text-lg font-bold">At a glance</h2>
        <p className="text-sm"><span className="block text-muted-foreground">Current memberships</span><strong className="text-2xl">{members.length}</strong></p>
        <p className="text-sm"><span className="block text-muted-foreground">Public bodies</span><strong className="text-2xl">{profile.organs.length}</strong></p>
        <button type="button" onClick={() => onTab('members')} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Member directory <ArrowRight className="size-4" aria-hidden="true" /></button>
      </aside>
    </div>
  );
}

function WorldMembers({ profile }: { profile: PublicWorldProfile }) {
  // Country catalogue is only requested when the user opens Members.
  // It is shared with the rest of Solaris through the canonical query cache.
  const countriesQuery = useCountries();
  const countriesById = useMemo(() => new Map((countriesQuery.data ?? []).map((country) => [country.id, country])), [countriesQuery.data]);
  const representatives = useMemo(() => new Map(currentWorldRepresentatives(profile).map((rep) => [rep.countryId, rep])), [profile]);
  const members = currentWorldMemberships(profile);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Current members <span className="text-sm font-normal text-muted-foreground">({members.length})</span></h2>
      {!members.length ? <AppEmptyState title="No memberships recorded" description="Membership history will only appear after an official record has been created." /> :
        <>
          {countriesQuery.isPending ? <p role="status" className="text-sm text-muted-foreground">Resolving country identities…</p> : null}
          {countriesQuery.isError ? <p role="status" className="text-sm text-muted-foreground">Country names are temporarily unavailable. Membership statuses remain authoritative.</p> : null}
          <ul className="divide-y divide-border">
            {members.map((member) => {
              const country = countriesById.get(member.countryId);
              const representative = representatives.get(member.countryId);
              return <li key={member.id} className="flex min-h-20 items-center gap-3 py-3">
                {country ? <FlagChip code={country.short_code} image={country.flag_image} color={country.accent_color} size="md" /> :
                  <Globe2 className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  {country ? <Link to="/countries/$code" params={{ code: country.short_code }} className="font-semibold hover:underline">{country.name}</Link> :
                    <span className="font-semibold">Country identity unavailable</span>}
                  <p className="text-xs text-muted-foreground">{representative?.displayName ? 'Representative: ' + representative.displayName : 'Representative not recorded'}</p>
                </div>
                <span className="shrink-0 text-xs capitalize text-muted-foreground">{member.status}</span>
              </li>;
            })}
          </ul>
        </>
      }
    </div>
  );
}

function WorldLeadership({ profile }: { profile: PublicWorldProfile }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Leadership and offices</h2>
      {!profile.offices.length ? <AppEmptyState title="No public offices" description="This institution has no public office records yet." /> :
        <ul className="divide-y divide-border">
          {profile.offices.map((office) => <li key={office.id} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-5">
            <div><h3 className="font-semibold">{office.title}</h3>
              {office.termLengthEditions ? <p className="mt-1 text-xs text-muted-foreground">Standard term: {office.termLengthEditions} SSC editions</p> : null}
            </div>
            <div><p className="text-sm">{office.currentHolder || 'No current officeholder recorded'}</p>
              {office.currentHolder ? <p className="mt-1 text-xs text-muted-foreground">Current registered term</p> : null}
            </div>
          </li>)}
        </ul>}
      <p className="text-xs text-muted-foreground">Past terms and election records require separate published historical projections. No officeholders have been inferred from titles or lore.</p>
    </div>
  );
}
