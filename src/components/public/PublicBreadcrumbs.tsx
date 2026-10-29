import { Fragment, useEffect, useMemo, useState } from "react";
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
  type PublicBreadcrumbContext,
} from "@/lib/public-breadcrumbs";
import { useCountries, useEditions, useShow } from "@/lib/data";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

type BreadcrumbDataTarget =
  | { kind: "country" }
  | { kind: "edition" }
  | { kind: "show"; showId: string }
  | { kind: "static" };

function breadcrumbDataTarget(pathname: string): BreadcrumbDataTarget {
  if (/^\/(?:countries|wiki)\/[^/]+\/?$/i.test(pathname)) {
    return { kind: "country" };
  }

  if (/^\/(?:editions|stories)\/[^/]+\/?$/i.test(pathname)) {
    return { kind: "edition" };
  }

  const showMatch = pathname.match(/^\/shows\/([^/]+)\/?$/i);
  if (showMatch) {
    return { kind: "show", showId: decodeURIComponent(showMatch[1]) };
  }

  return { kind: "static" };
}

export function PublicBreadcrumbs({ pathname }: { pathname: string }) {
  const [hydrated, setHydrated] = useState(false);
  const target = useMemo(() => breadcrumbDataTarget(pathname), [pathname]);

  useEffect(() => setHydrated(true), []);

  if (target.kind === "country") {
    return <CountryBreadcrumbs pathname={pathname} hydrated={hydrated} />;
  }

  if (target.kind === "edition") {
    return <EditionBreadcrumbs pathname={pathname} hydrated={hydrated} />;
  }

  if (target.kind === "show") {
    return (
      <ShowBreadcrumbs
        pathname={pathname}
        showId={target.showId}
        hydrated={hydrated}
      />
    );
  }

  return <BreadcrumbView pathname={pathname} />;
}

function CountryBreadcrumbs({
  pathname,
  hydrated,
}: {
  pathname: string;
  hydrated: boolean;
}) {
  const { data: countries = [] } = useCountries();

  return (
    <BreadcrumbView
      pathname={pathname}
      context={{ countries: hydrated ? countries : [] }}
    />
  );
}

function EditionBreadcrumbs({
  pathname,
  hydrated,
}: {
  pathname: string;
  hydrated: boolean;
}) {
  const { data: editions = [] } = useEditions();

  return (
    <BreadcrumbView
      pathname={pathname}
      context={{ editions: hydrated ? editions : [] }}
    />
  );
}

function ShowBreadcrumbs({
  pathname,
  showId,
  hydrated,
}: {
  pathname: string;
  showId: string;
  hydrated: boolean;
}) {
  const { data: show } = useShow(showId);
  const { data: editions = [] } = useEditions();

  return (
    <BreadcrumbView
      pathname={pathname}
      context={{
        editions: hydrated ? editions : [],
        shows: hydrated && show ? [show] : [],
      }}
    />
  );
}

function BreadcrumbView({
  pathname,
  context = {},
}: {
  pathname: string;
  context?: PublicBreadcrumbContext;
}) {
  const crumbs = useMemo(
    () => publicBreadcrumbsForPath(pathname, context),
    [context, pathname],
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
