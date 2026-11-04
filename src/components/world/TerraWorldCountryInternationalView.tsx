import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Landmark, MapPin, Users } from "lucide-react";

import { FlagChip } from "@/components/FlagChip";
import { getTerraWorldCountryInternational } from "@/lib/terra-world-country-international.functions";
import type {
  WorldCountryInternational,
  WorldCountryMembership,
} from "@/lib/terra-world-country-international";

function GovernmentFact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="border-b border-border/60 py-3 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function formatInstitutionDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
    : "Date not verified";
}

function MembershipList({ title, members, id }: {
  title: string;
  members: WorldCountryMembership[];
  id: string;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-xl font-semibold">{title}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">{members.length}</span>
      </div>
      {members.length ? (
        <ul className="divide-y divide-border/60">
          {members.map((member) =>
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex-1">
                <a
                  href={"/world/organizations/" + encodeURIComponent(member.organizationSlug)}
                  className="inline-flex min-h-11 items-center gap-2 font-semibold hover:text-primary hover:underline"
                >
                  <Landmark aria-hidden="true" className="size-4 text-primary" />
                  {member.organizationName}
                  <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                </a>
                <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                  {member.membershipType} · {member.status}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {member.endedAt ? "Ended " + formatInstitutionDate(member.endedAt) : "Since " + formatInstitutionDate(member.joinedAt)}
              </p>
            </li>
          )}
        </ul>
      ) : (
        <p className="py-4 text-sm leading-6 text-muted-foreground">
          {id === "world-country-current-memberships"
            ? "No current public institutional memberships are recorded for this country."
            : "No former memberships are recorded publicly."}
        </p>
      )}
    </section>
  );
}

function Detail({ view }: { view: WorldCountryInternational }) {
  const { country, identity } = view;
  const officialLeader = identity.leaderName
    ? [identity.leaderTitle, identity.leaderName].filter(Boolean).join(" ")
    : null;
  return (
    <>
      <header className="border-b border-border/60 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Terra Solaris · Country International
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <FlagChip code={country.code} image={country.flagImage} color="#385A73" size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{identity.name}</h1>
            {identity.nativeName && identity.nativeName !== identity.name ? (
              <p className="mt-2 text-sm text-muted-foreground">{identity.nativeName}</p>
            ) : null}
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {country.region ?? "Terra Solaris"} · {country.code}
            </p>
          </div>
        </div>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground">
          This public record describes the country as a persistent Terra Solaris state, independently of whether it currently takes part in the Solaris Song Contest.
        </p>
        <Link
          to="/countries/$code"
          params={{ code: country.code }}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/40"
        >
          Explore contest history <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <div className="mt-9 grid gap-12 lg:grid-cols-[minmax(0,1.65fr)_minmax(250px,0.9fr)]">
        <div className="space-y-10">
          <section aria-labelledby="world-country-relationship-heading">
            <h2 id="world-country-relationship-heading" className="text-2xl font-semibold tracking-tight">
              International relationships
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Only public, officially registered organization memberships appear here. Invitations, pending applications and informal roleplay are not presented as memberships.
            </p>
          </section>
          <MembershipList title="Current memberships" members={view.currentMemberships} id="world-country-current-memberships" />
          <MembershipList title="Membership history" members={view.formerMemberships} id="world-country-former-memberships" />
          <div className="flex items-start gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
            <Users aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p className="leading-7">Representative and office appointments can be explored in each institution’s published leadership records. Private mandates, proxies and draft institutional decisions are not exposed here.</p>
          </div>
        </div>

        <aside className="space-y-8 border-t border-border/60 pt-7 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0" aria-label="Public country identity">
          <section aria-labelledby="world-country-government">
            <div className="flex items-center gap-2">
              <MapPin aria-hidden="true" className="size-4 text-primary" />
              <h2 id="world-country-government" className="text-lg font-semibold">Public country record</h2>
            </div>
            <dl className="mt-3">
              <GovernmentFact label="Capital" value={identity.capital} />
              <GovernmentFact label="Government" value={identity.governmentType} />
              <GovernmentFact label="Recorded leader" value={officialLeader} />
              <GovernmentFact label="Current country controller" value={identity.controllerName} />
            </dl>
            {!identity.controllerName ? (
              <p className="mt-4 text-xs leading-6 text-muted-foreground">
                No durable controller-person identity has been confirmed in the public governance record. This does not mean the country has no account controller.
              </p>
            ) : null}
            {!identity.capital && !identity.governmentType && !officialLeader ? (
              <p className="mt-4 text-sm leading-6 text-muted-foreground">No structured government details have been published yet.</p>
            ) : null}
          </section>
          <p className="border-t border-border/60 pt-5 text-xs leading-6 text-muted-foreground">
            Formal proposals, international voting, judicial cases and institutional documents become visible only through their separate governed publication systems. Absence of a record is not evidence of a decision.
          </p>
        </aside>
      </div>
    </>
  );
}

export function TerraWorldCountryInternationalView({ code }: { code: string }) {
  const load = useServerFn(getTerraWorldCountryInternational);
  const query = useQuery({
    queryKey: ["terra-world", "country-international", code.toUpperCase()],
    queryFn: () => load({ data: { code } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  if (query.isPending) return (
    <div role="status" className="space-y-4 py-7">
      <p className="text-sm text-muted-foreground">Loading public country information…</p>
      <div aria-hidden="true" className="h-24 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
      <div aria-hidden="true" className="h-40 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
    </div>
  );

  if (query.isError) return (
    <div role="alert" className="space-y-4 rounded-2xl border border-border p-6">
      <h1 className="text-2xl font-semibold">International record unavailable</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        The authoritative country and organization services could not verify the public record. No alternate or guessed data is displayed.
      </p>
      <button type="button" onClick={() => void query.refetch()} className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold">Retry</button>
    </div>
  );

  if (!query.data) return (
    <div className="space-y-4 py-8">
      <h1 className="text-2xl font-semibold">Country not found</h1>
      <p className="text-sm text-muted-foreground">No public country matches this code.</p>
      <Link to="/world/countries/" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Back to countries</Link>
    </div>
  );

  return <Detail view={query.data} />;
}
