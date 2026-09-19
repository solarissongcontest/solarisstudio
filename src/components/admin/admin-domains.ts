import {
  BookOpen,
  LayoutDashboard,
  Layers3,
  RadioTower,
  Settings2,
  ShieldCheck,
  Vote,
  type LucideIcon,
} from "lucide-react";

export type AdminDomainNavigationItem = {
  id:
    | "overview"
    | "contest"
    | "operations"
    | "voting-results"
    | "rules-integrity"
    | "publishing"
    | "administration";
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

/**
 * Stable level-one Organizer navigation.
 *
 * Detailed routes intentionally remain in admin-navigation.ts for section
 * navigation, search and deep links. A specialist tool being discoverable does
 * not mean it earns a permanent sidebar button.
 */
export function buildAdminDomainNavigation(slug?: string): AdminDomainNavigationItem[] {
  const contestHref = slug ? `/admin/${slug}` : "/admin/countries";
  const publishingHref = slug ? `/admin/publication/${slug}` : "/admin/storytelling";

  return [
    {
      id: "overview",
      label: "Overview",
      description: "Edition status, priorities and the next actions that matter.",
      to: "/admin/operations",
      icon: LayoutDashboard,
      active: (path) => path.startsWith("/admin/operations"),
    },
    {
      id: "contest",
      label: "Contest",
      description: "Delegations, entries, shows, hosting and eligibility.",
      to: contestHref,
      icon: Layers3,
      active: (path) =>
        path.startsWith("/admin/countries") ||
        path.startsWith("/confirmations/admin") ||
        (slug ? path === `/admin/${slug}` : false) ||
        path.startsWith("/admin/shows/") ||
        path.startsWith("/admin/entries/") ||
        path.startsWith("/admin/lineup-sync/") ||
        path.startsWith("/admin/participant-status/") ||
        path.startsWith("/admin/hosts") ||
        path.startsWith("/admin/eligibility") ||
        path.startsWith("/admin/submission-versions"),
    },
    {
      id: "operations",
      label: "Operations",
      description: "Action Center, live control, workflows, incidents and communications.",
      to: "/admin/action-center",
      icon: RadioTower,
      active: (path) =>
        path.startsWith("/admin/action-center") ||
        path.startsWith("/admin/action-centre") ||
        path.startsWith("/admin/control-room") ||
        path.startsWith("/admin/workflows") ||
        path.startsWith("/admin/incidents") ||
        path.startsWith("/admin/communications") ||
        path.startsWith("/admin/broadcast-rundown") ||
        path.startsWith("/admin/edition-simulator"),
    },
    {
      id: "voting-results",
      label: "Voting & Results",
      description: "Voting operations, integrity, results, reveal and analysis tools.",
      to: "/televoting/admin",
      icon: Vote,
      active: (path) =>
        path.startsWith("/televoting/admin") ||
        path.startsWith("/admin/jury/") ||
        path.startsWith("/admin/voting-system/") ||
        path.startsWith("/admin/televote/") ||
        path.startsWith("/admin/friend-voting") ||
        path.startsWith("/admin/jury-integrity") ||
        path.startsWith("/admin/results") ||
        path.startsWith("/admin/results-reveal") ||
        path.startsWith("/admin/voting-lab"),
    },
    {
      id: "rules-integrity",
      label: "Rules & Integrity",
      description: "Rules, interpretations, investigations, evidence and appeals.",
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
      id: "publishing",
      label: "Publishing",
      description: "Stories, media, public release controls and broadcast design.",
      to: publishingHref,
      icon: BookOpen,
      active: (path) =>
        path.startsWith("/admin/storytelling") ||
        path.startsWith("/admin/media-assets") ||
        path.startsWith("/admin/publication/") ||
        path.startsWith("/admin/design/") ||
        path.startsWith("/admin/edition-theme/"),
    },
    {
      id: "administration",
      label: "Administration",
      description: "Editions, accounts, rollout, diagnostics, testing and system controls.",
      to: "/admin/more",
      icon: Settings2,
      active: (path) =>
        path === "/admin" ||
        path === "/admin/" ||
        path.startsWith("/admin/menu") ||
        path.startsWith("/admin/more") ||
        path.startsWith("/admin/access-permissions") ||
        path.startsWith("/admin/feature-rollout") ||
        path.startsWith("/admin/guide") ||
        path.startsWith("/admin/country-accounts") ||
        path.startsWith("/admin/hod-history") ||
        path.startsWith("/admin/predictions") ||
        path.startsWith("/admin/anniversary") ||
        path.startsWith("/admin/public-ux") ||
        path.startsWith("/admin/beta") ||
        path.startsWith("/admin/admin-beta") ||
        path.startsWith("/admin/sync-health") ||
        path.startsWith("/admin/system"),
    },
  ];
}
