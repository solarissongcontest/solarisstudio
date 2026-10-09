import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock3, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAllShows, useCountries, useEditions } from "@/lib/data";
import { useMyFollows } from "@/lib/engagement-data";
import { writeOfflinePublicIndex } from "@/lib/app-offline-snapshot";
import { useFanSession } from "@/lib/prediction-data";
import { isShowPublic } from "@/lib/publication";
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

  useEffect(() => {
    if (!countries.data || !editions.data || !shows.data) return;
    writeOfflinePublicIndex({
      countries: countries.data,
      editions: editions.data,
      shows: shows.data.filter((show) => isShowPublic(show)),
    });
  }, [countries.data, editions.data, shows.data]);

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
      {recents.length ? (
        <section aria-labelledby="app-explore-recent">
          <div className="solaris-app-section-heading">
            <p>Continue</p>
            <h2 id="app-explore-recent" className="flex items-center gap-2">
              <Clock3 className="size-4 text-primary" aria-hidden="true" />
              Recently viewed
            </h2>
          </div>
          <div className="solaris-app-grouped-list">
            {recents.map((item) => (
              <Link key={item.path} to={item.path as any} className="solaris-app-list-row">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">Recently viewed</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {followed.length ? (
        <section aria-labelledby="app-explore-following">
          <div className="solaris-app-section-heading">
            <p>Your Solaris</p>
            <h2 id="app-explore-following" className="flex items-center gap-2">
              <Star className="size-4 text-primary" aria-hidden="true" />
              Following
            </h2>
          </div>
          <div className="solaris-app-grouped-list">
            {followed.map((item) => (
              <Link key={item.id} to={item.to as any} className="solaris-app-list-row">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.meta}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
