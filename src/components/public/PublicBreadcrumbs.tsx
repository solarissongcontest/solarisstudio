import { Fragment, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  publicBreadcrumbsForPath,
  type PublicBreadcrumb,
} from "@/lib/public-breadcrumbs";
import { useAllShows, useCountries, useEditions } from "@/lib/data";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

/**
 * Ordinary browser routes must not mount archive-wide queries just to show
 * two static breadcrumb labels. Only matching entity routes need data-backed
 * names; each family mounts only the queries used by its own breadcrumb.
 */
export function PublicBreadcrumbs({ pathname }: { pathname: string }) {
  if (/^\/(?:countries|wiki)\/[^/]+\/?$/i.test(pathname)) {
    return <CountryBreadcrumbs pathname={pathname} />;
  }

  if (/^\/(?:editions|stories)\/[^/]+\/?$/i.test(pathname)) {
    return <EditionBreadcrumbs pathname={pathname} />;
  }

  if (/^\/shows\/[^/]+\/?$/i.test(pathname)) {
    return <ShowBreadcrumbs pathname={pathname} />;
  }

  return <BreadcrumbTrail crumbs={publicBreadcrumbsForPath(pathname)} />;
}

function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

function CountryBreadcrumbs({ pathname }: { pathname: string }) {
  const { data: countries = [] } = useCountries();
  const hydrated = useHydrated();
  return (
    <BreadcrumbTrail
      crumbs={publicBreadcrumbsForPath(pathname, {
        countries: hydrated ? countries : [],
      })}
    />
  );
}

function EditionBreadcrumbs({ pathname }: { pathname: string }) {
  const { data: editions = [] } = useEditions();
  const hydrated = useHydrated();
  return (
    <BreadcrumbTrail
      crumbs={publicBreadcrumbsForPath(pathname, {
        editions: hydrated ? editions : [],
      })}
    />
  );
}

function ShowBreadcrumbs({ pathname }: { pathname: string }) {
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const hydrated = useHydrated();
  return (
    <BreadcrumbTrail
      crumbs={publicBreadcrumbsForPath(pathname, {
        editions: hydrated ? editions : [],
        shows: hydrated ? shows : [],
      })}
    />
  );
}

function BreadcrumbTrail({ crumbs }: { crumbs: PublicBreadcrumb[] }) {
  if (!crumbs.length) return null;

  return (
    <Breadcrumb className="mb-4 sm:mb-5">
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem>
                {last || !crumb.to ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      to={crumb.to as any}
                      onClick={() =>
                        trackPublicUxEvent("breadcrumb_clicked", {
                          target: crumb.to,
                          metadata: { source: "breadcrumb" },
                        })
                      }
                    >
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last ? <BreadcrumbSeparator /> : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
