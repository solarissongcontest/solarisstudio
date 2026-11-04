import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, History, Landmark } from "lucide-react";

import { FlagChip } from "@/components/FlagChip";
import {
  useWorldMembershipCountry,
  useWorldMembershipHistory,
} from "@/lib/world-membership-history-data";
import {
  currentMembershipPeriod,
  currentRepresentativePeriods,
  isWorldMembershipRoute,
  membershipLabel,
} from "@/lib/world-membership-history";

const actionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function formatWorldDate(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function LoadingMembership({ message }: { message: string }) {
  return (
    <div role="status" className="space-y-3 py-8" aria-live="polite">
      <p className="text-sm text-muted-foreground">{message}</p>
      <div aria-hidden="true" className="h-14 animate-pulse rounded-lg bg-surface" />
      <div aria-hidden="true" className="h-14 animate-pulse rounded-lg bg-surface" />
    </div>
  );
}

function MembershipError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="border-y border-border py-8">
      <h2 className="text-lg font-semibold">The official record could not be loaded</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        No membership, representative or officeholder has been inferred while
        the authoritative public projection is unavailable.
      </p>
      <button className={actionClass + " mt-4"} type="button" onClick={retry}>Retry</button>
    </div>
  );
}

export function WorldMembershipHistoryScreen({ slug, code }: { slug: string; code: string }) {
  // Resolve route validity before installing any data-bearing query. Even a
  // valid country code must not trigger a read from an invalid organization URL.
  const validRoute = isWorldMembershipRoute(slug, code);
  const country = useWorldMembershipCountry(code, validRoute);
  const relationship = useWorldMembershipHistory(slug, country.data?.id, validRoute);

  if (!validRoute) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold">Invalid membership link</h1>
        <Link to="/world" className={actionClass + " mt-5"}>Browse Terra Solaris</Link>
      </div>
    );
  }

  if (country.isPending) {
    return <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><LoadingMembership message="Loading country identity…" /></div>;
  }
  if (country.isError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <MembershipError retry={() => { void country.refetch(); }} />
      </div>
    );
  }
  if (!country.data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold">Country not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">No public country matches this link.</p>
        <Link to="/countries" className={actionClass + " mt-4"}>Browse countries</Link>
      </div>
    );
  }

  if (relationship.isPending) {
    return <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><LoadingMembership message="Loading public membership history…" /></div>;
  }
  if (relationship.isError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <MembershipError retry={() => { void relationship.refetch(); }} />
      </div>
    );
  }
  const state = relationship.data;
  if (!state) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold">Organization not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The organization does not exist or is not public. No private relationship is disclosed.
        </p>
        <Link to="/world" className={actionClass + " mt-4"}>Browse organizations</Link>
      </div>
    );
  }

  const current = currentMembershipPeriod(state.membership);
  const currentReps = currentRepresentativePeriods(state.representations);
  const completed = state.membership.filter((period) => period.endedAt !== null);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-14 pt-4 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-7 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/world" className="hover:text-foreground">Terra Solaris</Link>
        <ChevronRight className="size-3" aria-hidden="true" />
        <Link to="/world/organizations/$slug" params={{ slug }} className="hover:text-foreground">
          {state.organizationName}
        </Link>
        <ChevronRight className="size-3" aria-hidden="true" />
        <span aria-current="page">{country.data.name}</span>
      </nav>

      <header className="mb-8 border-b border-border pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
          International relationship
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <FlagChip
            code={country.data.code}
            color="#586c9a"
            image={country.data.flagImage}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{country.data.name}</h1>
            <p className="mt-1 text-base text-muted-foreground">{state.organizationFullName}</p>
          </div>
        </div>
        <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">
          This page records membership and representatives for this country in this specific
          institution. It is not a record of SSC participation or a substitute for a formal decision.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-10">
          <section aria-labelledby="world-membership-current">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Current relationship</p>
            <h2 id="world-membership-current" className="mt-1 text-2xl font-bold">Membership status</h2>
            {current ? (
              <div className="mt-4 border-y border-border py-5">
                <p className="text-xl font-semibold">{membershipLabel(current.status)}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Type: {membershipLabel(current.membershipType)} · Since {formatWorldDate(current.joinedAt)}
                </p>
                {current.status === "suspended" ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    The official record lists this membership as suspended, not terminated.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 border-y border-border py-5">
                <p className="font-semibold">No current membership recorded</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  The country may have historical membership or may never have joined.
                  No membership has been inferred from country existence.
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="world-membership-history">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <History className="size-4" aria-hidden="true" /> Historical record
            </div>
            <h2 id="world-membership-history" className="mt-2 text-2xl font-bold">Membership timeline</h2>
            {state.membership.length ? (
              <ol className="mt-4 divide-y divide-border border-y border-border">
                {state.membership.map((period) => (
                  <li key={period.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                      <p className="font-semibold">{membershipLabel(period.status)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{membershipLabel(period.membershipType)} membership</p>
                    </div>
                    <p className="text-sm text-muted-foreground sm:text-right">
                      {formatWorldDate(period.joinedAt)}
                      {period.endedAt ? " – " + formatWorldDate(period.endedAt) : " – present"}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 border-y border-border py-5 text-sm text-muted-foreground">
                No membership periods are recorded for this country and organization.
              </p>
            )}
            {completed.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {completed.length} concluded membership period{completed.length === 1 ? "" : "s"} retained in the official projection.
              </p>
            ) : null}
          </section>
        </div>

        <div className="space-y-10">
          <section aria-labelledby="world-representatives-heading">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Representation</p>
            <h2 id="world-representatives-heading" className="mt-1 text-xl font-bold">Representatives</h2>
            {state.representations.length ? (
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {state.representations.map((rep) => (
                  <li key={rep.id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{rep.displayName}</p>
                      <span className="text-xs text-muted-foreground">{rep.endsAt ? "Former" : "Current"}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {membershipLabel(rep.role)}{rep.votingAuthority ? " · Voting authority recorded" : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatWorldDate(rep.startsAt)}
                      {rep.endsAt ? " – " + formatWorldDate(rep.endsAt) : " – present"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No public representative history recorded.</p>
            )}
            {!currentReps.length && state.representations.length > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No current representative is recorded.</p>
            ) : null}
          </section>

          <section aria-labelledby="world-offices-heading">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Landmark className="size-4" aria-hidden="true" /> Institutional office
            </div>
            <h2 id="world-offices-heading" className="mt-2 text-xl font-bold">Current offices held</h2>
            {state.currentOffices.length ? (
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {state.currentOffices.map((office) => (
                  <li key={office.id} className="py-4">
                    <p className="font-semibold">{office.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{office.holderName}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No currently held office is recorded for this country in this institution.
              </p>
            )}
          </section>

          <div className="flex flex-wrap gap-3">
            <Link to="/world/organizations/$slug" params={{ slug }} className={actionClass}>
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to {state.organizationName}
            </Link>
            <Link to="/countries/$code" params={{ code: country.data.code }} className={actionClass}>
              Country profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
