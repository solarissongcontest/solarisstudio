import { Link } from "@tanstack/react-router";

import {
  PUBLIC_GLOBAL_AREAS,
  publicAreaForPath,
  publicDestinationsForArea,
  publicPathMatches,
  type PublicDestination,
} from "@/lib/public-navigation";
import {
  publicGlobalAreasForContext,
  type PublicUserContext,
} from "@/lib/public-user-context";
import { cn } from "@/lib/utils";

export function PublicDrawerNavigation({
  pathname,
  user,
}: {
  pathname: string;
  user: PublicUserContext;
}) {
  const area = publicAreaForPath(pathname);
  const globalAreas = publicGlobalAreasForContext(user);
  const areaRoot = PUBLIC_GLOBAL_AREAS.find((item) => item.id === area)?.to ?? null;
  const localItems =
    area === "home" || area === "me"
      ? []
      : publicDestinationsForArea(area, { includeContextual: false }).filter(
          (item) => item.to !== areaRoot,
        );

  return (
    <div className="space-y-5">
      <section aria-labelledby="drawer-global-navigation">
        <div className="px-2">
          <h2 id="drawer-global-navigation" className="public-site-sidebar-label">
            Solaris Studio
          </h2>
        </div>
        <div className="mt-1.5 space-y-0.5">
          {globalAreas.map((item) => {
            const active = area === item.id;
            return (
              <Link
                key={item.id}
                to={item.to as any}
                aria-current={active ? "page" : undefined}
                className={cn("public-drawer-page-link", active && "is-active")}
              >
                <span>{item.label}</span>
                <small>{item.description}</small>
              </Link>
            );
          })}
        </div>
      </section>

      {localItems.length ? (
        <DrawerSection
          title={area === "help" ? "Rules & help" : `In ${areaLabel(area)}`}
          items={localItems}
          pathname={pathname}
        />
      ) : null}

      <section aria-labelledby="drawer-utilities">
        <div className="px-2">
          <h2 id="drawer-utilities" className="public-site-sidebar-label">
            Find & help
          </h2>
        </div>
        <div className="mt-1.5 space-y-0.5">
          <Link to="/site-directory" className="public-drawer-page-link">
            <span>All Solaris pages</span>
            <small>Browse every public destination without cluttering the main navigation.</small>
          </Link>
          <Link
            to="/guide"
            aria-current={publicPathMatches(pathname, "/guide") ? "page" : undefined}
            className={cn(
              "public-drawer-page-link",
              publicPathMatches(pathname, "/guide") && "is-active",
            )}
          >
            <span>Help</span>
            <small>Plain-language help for using Solaris Studio.</small>
          </Link>
          <Link
            to="/rules"
            aria-current={publicPathMatches(pathname, "/rules") ? "page" : undefined}
            className={cn(
              "public-drawer-page-link",
              publicPathMatches(pathname, "/rules") && "is-active",
            )}
          >
            <span>Rules</span>
            <small>Official SSC rules and rulebook guidance.</small>
          </Link>
          {user.organizer ? (
            <Link to="/admin/operations" className="public-drawer-page-link">
              <span>Open Organizer</span>
              <small>Enter the operational workspace.</small>
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function DrawerSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: PublicDestination[];
  pathname: string;
}) {
  const activeTo = items
    .filter((item) => publicPathMatches(pathname, item.to))
    .sort((a, b) => b.to.length - a.to.length)[0]?.to;

  return (
    <section aria-label={title}>
      <div className="px-2">
        <h2 className="public-site-sidebar-label">{title}</h2>
      </div>
      <div className="mt-1.5 space-y-0.5">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.to as any}
            aria-current={item.to === activeTo ? "page" : undefined}
            className={cn("public-drawer-page-link", item.to === activeTo && "is-active")}
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}

function areaLabel(area: ReturnType<typeof publicAreaForPath>) {
  switch (area) {
    case "explore":
      return "Explore";
    case "participate":
      return "Participate";
    case "results":
      return "Results";
    case "help":
      return "Rules & help";
    case "me":
      return "Me";
    default:
      return "Home";
  }
}
