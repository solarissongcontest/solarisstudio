import { Link } from "@tanstack/react-router";

import { useEditions } from "@/lib/data";
import { adminDelegationRoute, adminEditionRoute } from "@/lib/admin-app-navigation";
import { useAdminContext } from "./AdminContext";
import { resolveAdminEditionContext } from "./admin-edition-context";
import "@/styles/v3-organizer-web-navigation.css";

const normalize = (path: string) => path.replace(/\/+$/, "") || "/";

/**
 * Browser-only fallback while V3 Organizer rollout remains disabled.
 * Uses the canonical V6 Home / Edition / Tasks / Delegations / More routes,
 * native browser history and the server-resolved edition context. No
 * installed-app tab memory, fixed dock, or artificial edition fallback.
 */
export function OrganizerLegacyWebNavigation({ pathname }: { pathname: string }) {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const activeEdition = resolveAdminEditionContext(editions, editionId);
  const slug = activeEdition?.slug ?? null;

  const items = [
    { id: "home", label: "Home", to: "/admin/operations", active: pathname.startsWith("/admin/operations") },
    { id: "edition", label: "Edition", to: slug ? `/admin/${slug}` : null, active: adminEditionRoute(pathname, slug) },
    {
      id: "tasks",
      label: "Tasks",
      to: "/admin/tasks",
      active: pathname.startsWith("/admin/tasks") ||
        pathname.startsWith("/admin/action-center") ||
        pathname.startsWith("/admin/action-centre") ||
        pathname.startsWith("/admin/inbox"),
    },
    { id: "delegations", label: "Delegations", to: "/admin/countries", active: adminDelegationRoute(pathname) },
    { id: "more", label: "More", to: "/admin/more", active: false },
  ] as const;
  const earlierActive = items.some((item) => item.id !== "more" && item.active);
  const normalizedCurrent = normalize(pathname);

  return (
    <nav
      className="v3-organizer-web-navigation"
      aria-label="Organizer website sections"
      data-organizer-legacy-web-navigation=""
    >
      {items.map((item) => {
        const active = item.id === "more" ? !earlierActive : item.active;
        const current = active && item.to
          ? normalizedCurrent === normalize(item.to) ? "page" : "location"
          : undefined;
        return item.to ? (
          <Link
            key={item.id}
            to={item.to as any}
            aria-current={current}
            data-active={active ? "true" : "false"}
            className="v3-organizer-web-navigation__link"
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.id}
            className="v3-organizer-web-navigation__link v3-organizer-web-navigation__link--disabled"
            aria-disabled="true"
            title="Select an edition first"
          >
            {item.label}
          </span>
        );
      })}
    </nav>
  );
}
