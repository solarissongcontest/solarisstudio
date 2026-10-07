import {
  BellRing,
  Flag,
  LayoutDashboard,
  Layers3,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

type AdminDomainNavigationItemBase = {
  id: "home" | "edition" | "tasks" | "delegations" | "more";
  label: string;
  description: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

export type AdminDomainNavigationItem =
  | (AdminDomainNavigationItemBase & {
      availability: "ready";
      to: string;
    })
  | (AdminDomainNavigationItemBase & {
      availability: "requires-edition";
      to: null;
      unavailableReason: "Select an edition first";
    });

/**
 * Organisation OS V5 keeps five permanent Organizer destinations.
 *
 * This is intentionally not the full sitemap. Specialist tools stay reachable
 * through contextual workspaces, Organizer Search and the complete tool
 * directory without turning permanent navigation into implementation history.
 */
export function buildAdminDomainNavigation(
  slug?: string,
  editionLabel = "Current edition",
): AdminDomainNavigationItem[] {
  const editionHref = slug ? `/admin/${slug}` : null;

  const tasksRoute = (path: string) =>
    path.startsWith("/admin/tasks") ||
    path.startsWith("/admin/action-center") ||
    path.startsWith("/admin/action-centre") ||
    path.startsWith("/admin/inbox");

  const delegationsRoute = (path: string) =>
    path.startsWith("/admin/countries") ||
    path.startsWith("/admin/next-in-line") ||
    path.startsWith("/confirmations/admin") ||
    path.startsWith("/admin/submission-versions");

  const editionRoute = (path: string) =>
    (slug ? path === `/admin/${slug}` : false) ||
    path.startsWith("/admin/shows/") ||
    path.startsWith("/admin/entries/") ||
    path.startsWith("/admin/lineup-sync/") ||
    path.startsWith("/admin/participant-status/") ||
    path.startsWith("/admin/hosts") ||
    path.startsWith("/admin/eligibility") ||
    path.startsWith("/televoting/admin") ||
    path.startsWith("/admin/jury/") ||
    path.startsWith("/admin/voting-system/") ||
    path.startsWith("/admin/televote/") ||
    path.startsWith("/admin/friend-voting") ||
    path.startsWith("/admin/jury-integrity") ||
    path.startsWith("/admin/results") ||
    path.startsWith("/admin/results-reveal") ||
    path.startsWith("/admin/voting-lab") ||
    path.startsWith("/admin/control-room") ||
    path.startsWith("/admin/workflows") ||
    path.startsWith("/admin/incidents") ||
    path.startsWith("/admin/broadcast-rundown") ||
    path.startsWith("/admin/edition-simulator") ||
    path.startsWith("/admin/storytelling") ||
    path.startsWith("/admin/media-assets") ||
    path.startsWith("/admin/communications") ||
    path.startsWith("/admin/publication/") ||
    path.startsWith("/admin/design/") ||
    path.startsWith("/admin/edition-theme/");

  const homeRoute = (path: string) => path.startsWith("/admin/operations");

  return [
    {
      id: "home",
      label: "Home",
      description: "Current edition state, urgent attention and the next operation.",
      availability: "ready",
      to: "/admin/operations",
      icon: LayoutDashboard,
      active: homeRoute,
    },
    {
      id: "edition",
      label: editionLabel,
      description: "Contest structure, voting, results, publication and live show operation.",
      ...(editionHref
        ? { availability: "ready" as const, to: editionHref }
        : {
            availability: "requires-edition" as const,
            to: null,
            unavailableReason: "Select an edition first" as const,
          }),
      icon: Layers3,
      active: editionRoute,
    },
    {
      id: "tasks",
      label: "Tasks",
      description: "Every unresolved organizer action, blocker and due item.",
      availability: "ready",
      to: "/admin/tasks",
      icon: BellRing,
      active: tasksRoute,
    },
    {
      id: "delegations",
      label: "Delegations",
      description: "Countries, confirmations, participation, readiness and delegation support.",
      availability: "ready",
      to: "/admin/countries",
      icon: Flag,
      active: delegationsRoute,
    },
    {
      id: "more",
      label: "More",
      description:
        "Governance, people, system, archive, engagement, research and specialist tools.",
      availability: "ready",
      to: "/admin/more",
      icon: MoreHorizontal,
      active: (path) =>
        !homeRoute(path) && !tasksRoute(path) && !delegationsRoute(path) && !editionRoute(path),
    },
  ];
}
