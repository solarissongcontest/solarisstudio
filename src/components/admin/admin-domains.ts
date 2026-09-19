import {
  Inbox,
  LayoutDashboard,
  Layers3,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type AdminDomainNavigationItem = {
  id: "home" | "inbox" | "edition" | "rules-cases" | "administration";
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

/**
 * Permanent Organizer navigation stays deliberately small.
 *
 * This is not the full sitemap. Specialist tools remain available through
 * contextual navigation and Search so everyday work is not buried under the
 * implementation history of Solaris Studio.
 */
export function buildAdminDomainNavigation(
  slug?: string,
  editionLabel = "Current edition",
): AdminDomainNavigationItem[] {
  const editionHref = slug ? `/admin/${slug}` : "/admin";

  const editionRoute = (path: string) =>
    path.startsWith("/admin/countries") ||
    path.startsWith("/confirmations/admin") ||
    (slug ? path === `/admin/${slug}` : false) ||
    path.startsWith("/admin/shows/") ||
    path.startsWith("/admin/entries/") ||
    path.startsWith("/admin/lineup-sync/") ||
    path.startsWith("/admin/participant-status/") ||
    path.startsWith("/admin/hosts") ||
    path.startsWith("/admin/eligibility") ||
    path.startsWith("/admin/submission-versions") ||
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

  return [
    {
      id: "home",
      label: "Home",
      description: "What needs attention, what is coming up and the current edition state.",
      to: "/admin/operations",
      icon: LayoutDashboard,
      active: (path) =>
        path.startsWith("/admin/operations") ||
        path.startsWith("/admin/action-center") ||
        path.startsWith("/admin/action-centre"),
    },
    {
      id: "inbox",
      label: "Inbox",
      description: "New submissions and events that may require organizer attention.",
      to: "/admin/inbox",
      icon: Inbox,
      active: (path) => path.startsWith("/admin/inbox"),
    },
    {
      id: "edition",
      label: editionLabel,
      description: "Contest, voting, show operation and publication for the selected edition.",
      to: editionHref,
      icon: Layers3,
      active: editionRoute,
    },
    {
      id: "rules-cases",
      label: "Rules & Cases",
      description: "Complaints, investigations, rulings, appeals and the governed rulebook.",
      to: "/admin/integrity-investigations",
      icon: ShieldCheck,
      active: (path) =>
        path === "/admin/integrity" ||
        path.startsWith("/admin/integrity-") ||
        path.startsWith("/admin/integrity-case/") ||
        path.startsWith("/admin/integrity-resolution/") ||
        path.startsWith("/admin/rules-manager") ||
        path.startsWith("/admin/rule-interpretations"),
    },
    {
      id: "administration",
      label: "Administration",
      description: "People, access, editions, communications, system health and QA.",
      to: "/admin/more",
      icon: Settings2,
      active: (path) =>
        !path.startsWith("/admin/inbox") &&
        !path.startsWith("/admin/operations") &&
        !path.startsWith("/admin/action-center") &&
        !path.startsWith("/admin/action-centre") &&
        !editionRoute(path) &&
        !(
          path === "/admin/integrity" ||
          path.startsWith("/admin/integrity-") ||
          path.startsWith("/admin/integrity-case/") ||
          path.startsWith("/admin/integrity-resolution/") ||
          path.startsWith("/admin/rules-manager") ||
          path.startsWith("/admin/rule-interpretations")
        ),
    },
  ];
}
