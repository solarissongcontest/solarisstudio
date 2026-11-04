import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Flag, Landmark, Users } from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";
import {
  currentWorldLeadership,
  currentWorldMemberships,
  getPublicWorldMemberCountries,
  getPublicWorldOrganization,
  publicWorldOrganizationStatus,
  WORLD_DIRECTORY_STALE_MS,
} from "@/lib/world-public-organizations";

type OrganizationView = "overview" | "leadership" | "members";
const VALID_VIEWS: readonly OrganizationView[] = ["overview", "leadership", "members"];

function parseView(value: unknown): OrganizationView {
  return typeof value === "string" && VALID_VIEWS.includes(value as OrganizationView)
    ? value as OrganizationView
    : "overview";
}

export const Route = createFileRoute("/world/organizations/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: parseView(search.view),
  }),
  head: () => ({
    meta: [
      { title: "Organization — Terra Solaris" },
      { name: "description", content: "Read public Terra Solaris organization, leadership and membership records." },
    ],
  }),
  component: PublicWorldOrganizationPage,
});

function PublicWorldOrganizationPage() {
  const { slug } = Route.useParams();
  const { view } = Route.useSearch();
  const organization = useQuery({
    queryKey: ["v3-world-organization-public-projection", slug],
    queryFn: () => getPublicWorldOrganization(slug),
    staleTime: WORLD_DIRECTORY_STALE_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const projection = organization.data;
  const leadership = projection ? currentWorldLeadership(projection) : [];
  const members = projection ? currentWorldMemberships(projection) : [];
  const countries = useQuery({
    queryKey: ["v3-world-organization-member-countries", slug, projection?.organization.revision],
    queryFn: () => getPublicWorldMemberCountries(projection!),
    enabled: view === "members" && Boolean(projection),
    staleTime: WORLD_DIRECTORY_STALE_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (organization.isPending) {
    return (
      <AppShell>
        <PageHeader eyebrow="Terra Solaris / Organization" title="Organization" description="Loading the public institutional record…" />
        <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6" role="status">
          <div className="h-6 w-44 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-6 h-32 max-w-xl animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        </main>
      </AppShell>
    );
  }

  if (organization.isError || !projection) {
    return (
      <AppShell>
        <PageHeader eyebrow="Terra Solaris / Organization" title="Organization unavailable" description="The organization could not be displayed." />
        <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
          <p role={organization.isError ? "alert" : "status"} className="max-w-xl text-sm leading-7 text-muted-foreground">
            {organization.isError
              ? "Institutional records are temporarily unavailable. Please retry."
              : "No public organization exists at this address, or its records are not public."}
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            {organization.isError ? (
              <button
                type="button"
                onClick={() => organization.refetch()}
                className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                Try again
              </button>
            ) : null}
            <Link to="/world/organizations" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
              Back to organizations
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  const institution = projection.organization;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris / Organization"
        title={institution.shortName}
        description={institution.officialName === institution.shortName ? "Public institutional record" : institution.officialName}
      />
      <main className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6" data-v3-world-organization={institution.slug}>
        <Link
          to="/world/organizations"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> All organizations
        </Link>
        <div className="mt-4 border-b border-border/70 pb-7 md:flex md:items-end md:justify-between md:gap-10">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {publicWorldOrganizationStatus(institution.status)}
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{institution.officialName}</h1>
            {institution.description ? (
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{institution.description}</p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No public institutional description has been published.</p>
            )}
          </div>
          <p className="mt-4 shrink-0 text-xs text-muted-foreground md:mt-0">
            Public record revision {institution.revision}
          </p>
        </div>

        <nav aria-label="Organization sections" className="-mx-4 overflow-x-auto border-b border-border/70 px-4 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-1 py-2">
            {VALID_VIEWS.map((section) => (
              <Link
                key={section}
                to="/world/organizations/$slug"
                params={{ slug }}
                search={{ view: section }}
                aria-current={view === section ? "page" : undefined}
                className={
                  "inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
                  (view === section
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
                }
              >
                {section === "overview" ? "Overview" : section === "leadership" ? "Leadership" : "Members"}
              </Link>
            ))}
          </div>
        </nav>

        {view === "overview" ? (
          <div className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(250px,1fr)]">
            <section aria-labelledby="world-organization-about">
              <div className="flex items-center gap-2">
                <Landmark className="size-5 text-primary" aria-hidden="true" />
                <h2 id="world-organization-about" className="text-xl font-semibold">Institution</h2>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {institution.description || "No public description is available for this organization."}
              </p>
              <div className="mt-8 grid gap-4 border-y border-border/70 py-5 sm:grid-cols-2">
                <Link
                  to="/world/organizations/$slug"
                  params={{ slug }}
                  search={{ view: "leadership" }}
                  className="group rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Landmark className="size-4 text-primary" aria-hidden="true" /> Leadership
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {leadership.length} {leadership.length === 1 ? "recorded current officeholder" : "recorded current officeholders"}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm text-primary group-hover:underline">
                    View offices <ChevronRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
                <Link
                  to="/world/organizations/$slug"
                  params={{ slug }}
                  search={{ view: "members" }}
                  className="group rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="size-4 text-primary" aria-hidden="true" /> Membership
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {members.length} current {members.length === 1 ? "record" : "records"}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm text-primary group-hover:underline">
                    View members <ChevronRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            </section>
            <section aria-labelledby="world-organization-bodies">
              <h2 id="world-organization-bodies" className="text-lg font-semibold">Institutional bodies</h2>
              {!projection.organs.length ? (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">No public bodies have been recorded yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border/60">
                  {projection.organs.slice(0, 4).map((organ) => (
                    <li key={organ.id} className="py-3">
                      <p className="text-sm font-semibold">{organ.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{organ.type.replace(/_/g, " ")}</p>
                    </li>
                  ))}
                </ul>
              )}
              {projection.organs.length > 4 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {projection.organs.length - 4} additional public bodies are recorded.
                </p>
              ) : null}
            </section>
          </div>
        ) : null}

        {view === "leadership" ? (
          <section aria-labelledby="world-organization-leadership" className="pt-8">
            <h2 id="world-organization-leadership" className="text-xl font-semibold">Offices and current leadership</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Current terms come from the official institutional projection. Offices without a recorded active term remain unassigned in this public view.
            </p>
            {!projection.offices.length ? (
              <p className="mt-6 border-t border-border/70 py-6 text-sm text-muted-foreground">
                No public leadership offices have been configured.
              </p>
            ) : (
              <ul className="mt-5 grid gap-x-8 md:grid-cols-2">
                {projection.offices.map((office) => (
                  <li key={office.id} className="border-t border-border/70 py-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{office.title}</p>
                    <h3 className="mt-2 text-lg font-semibold">
                      {office.currentTerm?.status === "active"
                        ? office.currentTerm.holderDisplayName
                        : "No current officeholder recorded"}
                    </h3>
                    {office.currentTerm?.status === "active" ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Current institutional term
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {view === "members" ? (
          <section aria-labelledby="world-organization-members" className="pt-8">
            <h2 id="world-organization-members" className="text-xl font-semibold">Current membership</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {members.length} {members.length === 1 ? "current membership" : "current memberships"}.
              Former memberships remain part of the official historical record.
            </p>
            {!members.length ? (
              <p className="mt-6 border-t border-border/70 py-6 text-sm text-muted-foreground">
                No current member countries have been recorded.
              </p>
            ) : countries.isPending ? (
              <p role="status" className="mt-6 text-sm text-muted-foreground">Loading member-country identities…</p>
            ) : countries.isError ? (
              <div role="alert" className="mt-6 border-t border-border/70 py-6">
                <p className="text-sm">Country identities are unavailable. Membership names cannot be shown safely.</p>
                <button type="button" onClick={() => countries.refetch()} className="mt-3 min-h-11 text-sm font-semibold text-primary underline">
                  Try again
                </button>
              </div>
            ) : (
              <ul className="mt-5 grid gap-x-8 md:grid-cols-2">
                {members.map((member) => {
                  const country = countries.data?.[member.countryId];
                  return (
                    <li key={member.id} className="flex items-center gap-4 border-t border-border/70 py-4">
                      {country?.flag_image ? (
                        <img
                          src={country.flag_image}
                          alt=""
                          loading="lazy"
                          className="h-8 w-12 shrink-0 rounded-sm border border-border/70 object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-sm bg-muted" aria-hidden="true">
                          <Flag className="size-4 text-muted-foreground" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{country?.name || "Country details unavailable"}</p>
                        <p className="mt-1 text-xs capitalize text-muted-foreground">
                          {member.status.replace(/_/g, " ")} · {member.membershipType.replace(/_/g, " ")}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
