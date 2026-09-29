import { Link } from "@tanstack/react-router";
import { Clock3, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { useAllShows, useCountries, useEditions } from "@/lib/data";
import { useMyFollows } from "@/lib/engagement-data";
import { useFanSession } from "@/lib/prediction-data";
import {
  readPublicRecents,
  type PublicRecentDestination,
} from "@/lib/public-recents";

export function AppExplorePersonalized() {
  const [recents, setRecents] = useState<PublicRecentDestination[]>([]);
  const user = useFanSession();
  const follows = useMyFollows(user.data?.id);
  const countries = useCountries();
  const editions = useEditions();
  const shows = useAllShows();

  useEffect(() => {
    setRecents(readPublicRecents().slice(0, 4));
  }, []);

  const followed = useMemo(() => {
    const countryById = new Map((countries.data ?? []).map((item) => [item.id, item]));
    const editionById = new Map((editions.data ?? []).map((item) => [item.id, item]));
    const showById = new Map((shows.data ?? []).map((item) => [item.id, item]));

    return (follows.data?.follows ?? [])
      .map((follow) => {
        if (follow.entity_type === "country") {
          const country = countryById.get(follow.entity_id);
          return country
            ? {
                id: follow.id,
                label: country.name,
                meta: "Country",
                to: `/countries/${country.short_code}`,
              }
            : null;
        }

        if (follow.entity_type === "edition") {
          const edition = editionById.get(follow.entity_id);
          return edition
            ? {
                id: follow.id,
                label:
                  edition.edition_number == null
                    ? edition.name
                    : `SSC ${edition.edition_number} · ${edition.name}`,
                meta: "Edition",
                to: `/editions/${edition.slug}`,
              }
            : null;
        }

        const show = showById.get(follow.entity_id);
        return show
          ? { id: follow.id, label: show.name, meta: "Show", to: `/shows/${show.id}` }
          : null;
      })
      .filter(
        (
          item,
        ): item is {
          id: string;
          label: string;
          meta: string;
          to: string;
        } => Boolean(item),
      )
      .slice(0, 4);
  }, [countries.data, editions.data, follows.data?.follows, shows.data]);

  return (
    <div className="space-y-5" data-solaris-app-explore-personalized>
      <section className="solaris-app-search-card" aria-label="Search Solaris">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-primary">
            Find anything
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Countries, editions, shows, entries, results and rules.
          </p>
        </div>
        <PublicCommandPalette />
      </section>

      {recents.length ? (
        <section aria-labelledby="app-explore-recent">
          <div className="mb-2 flex items-center gap-2">
            <Clock3 className="size-4 text-primary" aria-hidden="true" />
            <h2 id="app-explore-recent" className="text-sm font-semibold">
              Recently viewed
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {recents.map((item) => (
              <Link key={item.path} to={item.path as any} className="solaris-app-compact-link">
                <span className="truncate font-semibold">{item.label}</span>
                <span className="text-[11px] text-muted-foreground">Continue →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {followed.length ? (
        <section aria-labelledby="app-explore-following">
          <div className="mb-2 flex items-center gap-2">
            <Star className="size-4 text-primary" aria-hidden="true" />
            <h2 id="app-explore-following" className="text-sm font-semibold">
              Following
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {followed.map((item) => (
              <Link key={item.id} to={item.to as any} className="solaris-app-compact-link">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{item.label}</span>
                  <span className="text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">
                    {item.meta}
                  </span>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
