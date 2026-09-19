import type { Country, Edition, Show } from "./data";
import {
  PUBLIC_DESTINATIONS,
  PUBLIC_GLOBAL_AREAS,
  publicAreaForPath,
  publicPathMatches,
} from "./public-navigation";

export type PublicBreadcrumb = {
  label: string;
  to?: string;
};

export type PublicBreadcrumbContext = {
  countries?: Pick<Country, "id" | "name" | "short_code">[];
  editions?: Pick<Edition, "id" | "edition_number" | "name" | "slug">[];
  shows?: Pick<Show, "id" | "edition_id" | "name">[];
};

export function publicBreadcrumbsForPath(
  pathname: string,
  context: PublicBreadcrumbContext = {},
): PublicBreadcrumb[] {
  const area = publicAreaForPath(pathname);

  const globalArea = PUBLIC_GLOBAL_AREAS.find((item) => item.id === area);
  const areaRoot =
    area === "help"
      ? { label: "Rules & help", to: "/guide" }
      : globalArea
        ? { label: globalArea.label, to: globalArea.to }
        : null;

  if (!areaRoot) return [];
  if (pathname === areaRoot.to || pathname === `${areaRoot.to}/`) return [];

  const matched = PUBLIC_DESTINATIONS.filter(
    (item) => item.area === area && publicPathMatches(pathname, item.to),
  ).sort((a, b) => b.to.length - a.to.length)[0];

  if (!matched || matched.to === areaRoot.to) return [];

  const crumbs: PublicBreadcrumb[] = [
    { label: areaRoot.label, to: areaRoot.to },
    pathname === matched.to || pathname === `${matched.to}/`
      ? { label: matched.label }
      : { label: matched.label, to: matched.to },
  ];

  if (pathname === matched.to || pathname === `${matched.to}/`) return crumbs;

  const detail = detailBreadcrumbs(pathname, context);
  return detail.length ? [...crumbs, ...detail] : crumbs;
}

function detailBreadcrumbs(
  pathname: string,
  context: PublicBreadcrumbContext,
): PublicBreadcrumb[] {
  const countryMatch = pathname.match(/^\/countries\/([^/]+)\/?$/i);
  if (countryMatch) {
    const code = decodeURIComponent(countryMatch[1]);
    const country = context.countries?.find(
      (item) => item.short_code.toLowerCase() === code.toLowerCase(),
    );
    return [{ label: country?.name ?? code.toUpperCase() }];
  }

  const wikiMatch = pathname.match(/^\/wiki\/([^/]+)\/?$/i);
  if (wikiMatch) {
    const code = decodeURIComponent(wikiMatch[1]);
    const country = context.countries?.find(
      (item) => item.short_code.toLowerCase() === code.toLowerCase(),
    );
    return [{ label: country?.name ?? code.toUpperCase() }];
  }

  const editionMatch = pathname.match(/^\/editions\/([^/]+)\/?$/i);
  if (editionMatch) {
    const slug = decodeURIComponent(editionMatch[1]);
    const edition = context.editions?.find((item) => item.slug === slug);
    return [{ label: edition ? editionCrumbLabel(edition) : humanize(slug) }];
  }

  const storyMatch = pathname.match(/^\/stories\/([^/]+)\/?$/i);
  if (storyMatch) {
    const slug = decodeURIComponent(storyMatch[1]);
    const edition = context.editions?.find((item) => item.slug === slug);
    return [{ label: edition ? editionCrumbLabel(edition) : humanize(slug) }];
  }

  const showMatch = pathname.match(/^\/shows\/([^/]+)\/?$/i);
  if (showMatch) {
    const showId = decodeURIComponent(showMatch[1]);
    const show = context.shows?.find((item) => item.id === showId);
    if (!show) return [{ label: "Show" }];

    const edition = context.editions?.find((item) => item.id === show.edition_id);
    return [
      ...(edition
        ? [
            {
              label: editionCrumbLabel(edition),
              to: `/editions/${edition.slug}`,
            },
          ]
        : []),
      { label: show.name },
    ];
  }

  const ruleMatch = pathname.match(/^\/rules\/([^/]+)\/?$/i);
  if (ruleMatch) {
    return [{ label: `Rule ${decodeURIComponent(ruleMatch[1])}` }];
  }

  if (/^\/integrity\/appeal\.[^/]+\/?$/i.test(pathname)) {
    return [{ label: "Appeal case" }];
  }

  return [];
}

function editionCrumbLabel(
  edition: Pick<Edition, "edition_number" | "name">,
) {
  return edition.edition_number ? `SSC ${edition.edition_number}` : edition.name;
}

function humanize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
