import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe2, Landmark, Users } from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";
import {
  getPublicWorldDirectory,
  publicWorldOrganizationStatus,
  WORLD_DIRECTORY_STALE_MS,
} from "@/lib/world-public-organizations";

export const Route = createFileRoute("/world/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris — Solaris Studio" },
      { name: "description", content: "Explore public Terra Solaris institutions and their official histories." },
    ],
  }),
  component: TerraSolarisWorldPage,
});

function TerraSolarisWorldPage() {
  const directory = useQuery({
    queryKey: ["v3-world-public-directory", "", "all", 0],
    queryFn: () => getPublicWorldDirectory({ search: "", status: "all", page: 0 }),
    staleTime: WORLD_DIRECTORY_STALE_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const featured = (directory.data?.organizations ?? []).filter((organization) =>
    organization.status === "active" || organization.status === "recognized",
  ).slice(0, 2);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris"
        title="The world beyond the contest"
        description="Explore international organizations, their published leadership, and the countries that form them. Official institutional information appears as it is established."
      />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6" data-v3-world-home="">
        <section className="grid gap-8 border-b border-border/60 pb-9 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Globe2 className="size-4" aria-hidden="true" /> World directory
            </p>
            <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Institutions, membership and official history
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Terra Solaris is more than an SSC lineup. Follow the public institutional record,
              from founding organizations to their current offices and member countries.
            </p>
            <Link
              to="/world/organizations"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Browse organizations <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid content-start gap-4 border-t border-border/60 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-1">
            <div className="flex gap-3">
              <Landmark className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">Canonical institutions</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Public records come from the world governance system, not invented summaries.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Users className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">Separate from SSC participation</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  A country's institutional membership is not determined by whether it enters an edition.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="world-featured-title" className="pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Discover</p>
              <h2 id="world-featured-title" className="mt-1 text-xl font-semibold">Public organizations</h2>
            </div>
            <Link to="/world/organizations" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
              View directory <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Link>
          </div>
          {directory.isPending ? (
            <p role="status" className="mt-6 text-sm text-muted-foreground">Loading public institutions…</p>
          ) : directory.isError ? (
            <div role="alert" className="mt-6 border-t border-border pt-5">
              <p className="text-sm">Institutional records are unavailable right now.</p>
              <button type="button" onClick={() => directory.refetch()} className="mt-3 min-h-11 text-sm font-semibold text-primary underline">
                Try again
              </button>
            </div>
          ) : featured.length ? (
            <ul className="mt-4 grid gap-0 divide-y divide-border/60 md:grid-cols-2 md:gap-x-8 md:divide-y-0">
              {featured.map((organization) => (
                <li key={organization.id} className="border-b border-border/60 py-4">
                  <Link to="/world/organizations/$slug" params={{ slug: organization.slug }} className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    <span className="text-xs font-semibold uppercase tracking-widest text-primary">{publicWorldOrganizationStatus(organization.status)}</span>
                    <span className="mt-1 block text-lg font-semibold group-hover:text-primary">{organization.short_name}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">{organization.description || organization.official_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              No public active or recognized organizations have been published yet.
            </p>
          )}
        </section>
      </main>
    </AppShell>
  );
}
