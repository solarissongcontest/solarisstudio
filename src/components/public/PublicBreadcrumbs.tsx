import { Fragment, useMemo } from "react";
import { Link } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { publicBreadcrumbsForPath } from "@/lib/public-breadcrumbs";
import { useAllShows, useCountries, useEditions } from "@/lib/data";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

export function PublicBreadcrumbs({ pathname }: { pathname: string }) {
  const { data: countries = [] } = useCountries();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const crumbs = useMemo(
    () =>
      publicBreadcrumbsForPath(pathname, {
        countries,
        editions,
        shows,
      }),
    [countries, editions, pathname, shows],
  );
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
