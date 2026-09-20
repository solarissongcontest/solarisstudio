import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import {
  PUBLIC_DESTINATIONS,
  publicSearchText,
  type PublicArea,
} from "@/lib/public-navigation";

export const Route = createFileRoute("/site-directory/")({
  head: () => ({
    meta: [
      { title: "All Solaris pages — Solaris Studio" },
      {
        name: "description",
        content: "Search and browse every public Solaris Studio destination.",
      },
    ],
  }),
  component: SiteDirectoryPage,
});

const AREA_ORDER: PublicArea[] = ["explore", "participate", "results", "help", "me", "home"];

const AREA_LABELS: Record<PublicArea, string> = {
  home: "Home & updates",
  explore: "Explore",
  participate: "Participate",
  results: "Results",
  me: "Me",
  help: "Rules & help",
};

function SiteDirectoryPage() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const matches = useMemo(() => {
    const discoverableDestinations = PUBLIC_DESTINATIONS.filter(
      (item) => item.discoverable !== false,
    );
    if (!normalizedQuery) return discoverableDestinations;
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return discoverableDestinations.filter((item) => {
      const searchable = publicSearchText(item);
      return terms.every((term) => searchable.includes(term));
    });
  }, [normalizedQuery]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Find"
        title="All Solaris pages"
        description="Search every public destination, including advanced tools and older Solaris names."
      />

      <label className="mx-auto mb-7 flex min-h-12 max-w-2xl items-center gap-3 rounded-2xl border border-border/75 bg-surface/70 px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search Solaris Studio pages</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages, tools or old feature names…"
          className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
      </label>

      {matches.length ? (
        <div className="space-y-8">
          {AREA_ORDER.map((area) => {
            const items = matches.filter((item) => item.area === area);
            if (!items.length) return null;

            return (
              <section key={area} aria-labelledby={`directory-${area}`}>
                <div className="mb-3 border-b border-border/60 pb-2">
                  <h2 id={`directory-${area}`} className="font-display text-xl font-bold">
                    {AREA_LABELS[area]}
                  </h2>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      to={item.to as any}
                      className="group min-w-0 rounded-xl border border-border/70 bg-surface/45 p-4 transition-colors hover:border-primary/30 hover:bg-surface/75"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-foreground">{item.label}</h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          {item.visibility}
                        </span>
                      </div>
                      {item.aliases?.length ? (
                        <p className="mt-3 text-[11px] text-muted-foreground">
                          Also known as {item.aliases.join(", ")}
                        </p>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-surface/45 px-5 py-10 text-center">
          <h2 className="font-display text-xl font-bold">No matching page</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Try a product name, task, country-related term or an older Solaris feature name.
          </p>
        </div>
      )}
    </AppShell>
  );
}
