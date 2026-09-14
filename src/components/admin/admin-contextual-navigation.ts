import { buildAdminDomainNavigation, type AdminDomainNavigationItem } from "./admin-domains";

export type AdminContextualTab = {
  label: string;
  to: string;
  active: (pathname: string) => boolean;
};

export type AdminContextualWorkflow = {
  label: string;
  tabs: AdminContextualTab[];
};

export type AdminContextualSection = {
  domain: AdminDomainNavigationItem;
  tabs: AdminContextualTab[];
  workflow: AdminContextualWorkflow | null;
};

export function buildAdminContextualSection(
  pathname: string,
  slug?: string,
): AdminContextualSection | null {
  const domain = buildAdminDomainNavigation(slug).find((item) => item.active(pathname));
  if (!domain) return null;

  return {
    domain,
    tabs: domainTabs(domain.id, slug),
    workflow: workflowTabs(pathname, slug),
  };
}

function domainTabs(
  domainId: AdminDomainNavigationItem["id"],
  slug?: string,
): AdminContextualTab[] {
  const contestHref = slug ? `/admin/${slug}` : "/admin/countries";
  const publishHref = slug ? `/admin/publication/${slug}` : "/admin/storytelling";
  const broadcastHref = slug ? `/admin/design/${slug}` : "/admin/storytelling";

  switch (domainId) {
    case "overview":
      return [
        tab("Overview", "/admin/operations", (path) => path.startsWith("/admin/operations")),
        tab(
          "Action Center",
          "/admin/action-center",
          (path) => path.startsWith("/admin/action-center") || path.startsWith("/admin/action-centre"),
        ),
      ];
    case "contest":
      return [
        tab(
          "Delegations",
          "/admin/countries",
          (path) => path.startsWith("/admin/countries") || path.startsWith("/confirmations/admin"),
        ),
        tab(
          "Contest",
          contestHref,
          (path) =>
            Boolean(slug && path === `/admin/${slug}`) ||
            path.startsWith("/admin/shows/") ||
            path.startsWith("/admin/entries/") ||
            path.startsWith("/admin/lineup-sync/") ||
            path.startsWith("/admin/participant-status/"),
        ),
        tab("Host", "/admin/hosts", (path) => path.startsWith("/admin/hosts")),
        tab("Eligibility", "/admin/eligibility", (path) => path.startsWith("/admin/eligibility")),
        tab(
          "Submission history",
          "/admin/submission-versions",
          (path) => path.startsWith("/admin/submission-versions"),
        ),
      ];
    case "operations":
      return [
        tab(
          "Action Center",
          "/admin/action-center",
          (path) => path.startsWith("/admin/action-center") || path.startsWith("/admin/action-centre"),
        ),
        tab("Control Room", "/admin/control-room", (path) => path.startsWith("/admin/control-room")),
        tab("Workflows", "/admin/workflows", (path) => path.startsWith("/admin/workflows")),
        tab("Incidents", "/admin/incidents", (path) => path.startsWith("/admin/incidents")),
        tab(
          "Rundown",
          "/admin/broadcast-rundown",
          (path) => path.startsWith("/admin/broadcast-rundown"),
        ),
        tab(
          "Communications",
          "/admin/communications",
          (path) => path.startsWith("/admin/communications"),
        ),
        tab(
          "Simulator",
          "/admin/edition-simulator",
          (path) => path.startsWith("/admin/edition-simulator"),
        ),
      ];
    case "voting-results":
      return [
        tab(
          "Voting",
          "/televoting/admin",
          (path) =>
            path.startsWith("/televoting/admin") ||
            path.startsWith("/admin/jury/") ||
            path.startsWith("/admin/voting-system/") ||
            path.startsWith("/admin/televote/") ||
            path.startsWith("/admin/friend-voting") ||
            path.startsWith("/admin/jury-integrity"),
        ),
        tab(
          "Results operations",
          "/admin/results",
          (path) => path.startsWith("/admin/results") && !path.startsWith("/admin/results-reveal"),
        ),
        tab(
          "Reveal Director",
          "/admin/results-reveal",
          (path) => path.startsWith("/admin/results-reveal"),
        ),
        tab("Voting Lab", "/admin/voting-lab", (path) => path.startsWith("/admin/voting-lab")),
      ];
    case "rules-integrity":
      return [
        tab("Rules", "/admin/rules-manager", (path) => path.startsWith("/admin/rules-manager")),
        tab(
          "Interpretations",
          "/admin/rule-interpretations",
          (path) => path.startsWith("/admin/rule-interpretations"),
        ),
        tab(
          "Investigations",
          "/admin/integrity-investigations",
          (path) =>
            path === "/admin/integrity" ||
            path.startsWith("/admin/integrity-investigations") ||
            path.startsWith("/admin/integrity-case/") ||
            path.startsWith("/admin/integrity-resolution/"),
        ),
        tab(
          "Rulings",
          "/admin/integrity-preclearance",
          (path) => path.startsWith("/admin/integrity-preclearance"),
        ),
        tab("Appeals", "/admin/integrity-appeals", (path) => path.startsWith("/admin/integrity-appeals")),
        tab("Evidence", "/admin/integrity-evidence", (path) => path.startsWith("/admin/integrity-evidence")),
        tab(
          "Disclosure",
          "/admin/integrity-disclosure",
          (path) => path.startsWith("/admin/integrity-disclosure"),
        ),
        tab(
          "Identity access",
          "/admin/integrity-identity",
          (path) => path.startsWith("/admin/integrity-identity"),
        ),
      ];
    case "publishing":
      return [
        tab("Storytelling", "/admin/storytelling", (path) => path.startsWith("/admin/storytelling")),
        tab("Media assets", "/admin/media-assets", (path) => path.startsWith("/admin/media-assets")),
        tab("Publish", publishHref, (path) => path.startsWith("/admin/publication/")),
        tab(
          "Broadcast",
          broadcastHref,
          (path) => path.startsWith("/admin/design/") || path.startsWith("/admin/edition-theme/"),
        ),
      ];
    case "administration":
      return [
        tab("Overview", "/admin/more", (path) => path.startsWith("/admin/more")),
        tab(
          "Access & permissions",
          "/admin/access-permissions",
          (path) => path.startsWith("/admin/access-permissions"),
        ),
        tab(
          "Feature rollout",
          "/admin/feature-rollout",
          (path) => path.startsWith("/admin/feature-rollout"),
        ),
        tab("All editions", "/admin", (path) => path === "/admin" || path === "/admin/"),
        tab("Guide", "/admin/guide", (path) => path.startsWith("/admin/guide")),
        tab(
          "Accounts",
          "/admin/country-accounts",
          (path) => path.startsWith("/admin/country-accounts"),
        ),
        tab("HOD history", "/admin/hod-history", (path) => path.startsWith("/admin/hod-history")),
        tab("Predictions", "/admin/predictions", (path) => path.startsWith("/admin/predictions")),
        tab("System health", "/admin/sync-health", (path) => path.startsWith("/admin/sync-health")),
        tab(
          "System",
          "/admin/system",
          (path) =>
            path.startsWith("/admin/system") ||
            path.startsWith("/admin/beta") ||
            path.startsWith("/admin/admin-beta") ||
            path.startsWith("/admin/anniversary"),
        ),
      ];
  }
}

function workflowTabs(pathname: string, slug?: string): AdminContextualWorkflow | null {
  if (pathname.startsWith("/confirmations/admin")) {
    return {
      label: "Delegations workflow",
      tabs: [
        tab("Overview", "/confirmations/admin", (path) => path === "/confirmations/admin" || path === "/confirmations/admin/"),
        tab(
          "Responses",
          "/confirmations/admin/responses",
          (path) => path.startsWith("/confirmations/admin/responses") || path.startsWith("/confirmations/admin/countries"),
        ),
        tab(
          "Rounds",
          "/confirmations/admin/rounds",
          (path) =>
            path.startsWith("/confirmations/admin/rounds") ||
            path.startsWith("/confirmations/admin/editions") ||
            path.startsWith("/confirmations/admin/sync"),
        ),
        tab("Calendar", "/confirmations/admin/calendar", (path) => path.startsWith("/confirmations/admin/calendar")),
        tab(
          "Access",
          "/confirmations/admin/recovery-codes",
          (path) => path.startsWith("/confirmations/admin/recovery-codes") || path.startsWith("/confirmations/admin/settings"),
        ),
      ],
    };
  }

  if (
    pathname.startsWith("/televoting/admin") ||
    pathname.startsWith("/admin/jury/") ||
    pathname.startsWith("/admin/voting-system/") ||
    pathname.startsWith("/admin/televote/") ||
    pathname.startsWith("/admin/friend-voting") ||
    pathname.startsWith("/admin/jury-integrity")
  ) {
    return {
      label: "Voting workflow",
      tabs: [
        tab("Overview", "/televoting/admin", (path) => path === "/televoting/admin" || path === "/televoting/admin/"),
        tab("Rules", slug ? `/admin/voting-system/${slug}` : "/admin", (path) => path.startsWith("/admin/voting-system/")),
        tab("Jury", slug ? `/admin/jury/${slug}` : "/admin", (path) => path.startsWith("/admin/jury/") || path.startsWith("/admin/jury-integrity")),
        tab(
          "Public voting",
          "/televoting/admin/rounds",
          (path) => path.startsWith("/televoting/admin/rounds") || path.startsWith("/televoting/admin/analytics"),
        ),
        tab(
          "Friend voting",
          "/admin/friend-voting",
          (path) => path.startsWith("/admin/friend-voting") || path.startsWith("/televoting/admin/intelligence"),
        ),
        tab(
          "Integrity",
          "/televoting/admin/integrity",
          (path) => path.startsWith("/televoting/admin/integrity") || path.startsWith("/televoting/admin/anti-abuse"),
        ),
        tab(
          "Results",
          "/televoting/admin/results",
          (path) =>
            path.startsWith("/televoting/admin/results") ||
            path.startsWith("/televoting/admin/combined") ||
            path.startsWith("/televoting/admin/backtest") ||
            path.startsWith("/admin/televote/"),
        ),
      ],
    };
  }

  if (
    pathname.startsWith("/admin/shows/") ||
    pathname.startsWith("/admin/entries/") ||
    pathname.startsWith("/admin/lineup-sync/") ||
    pathname.startsWith("/admin/participant-status/") ||
    Boolean(slug && pathname === `/admin/${slug}`)
  ) {
    return {
      label: "Contest workflow",
      tabs: [
        tab("Overview", slug ? `/admin/${slug}` : "/admin", (path) => Boolean(slug && path === `/admin/${slug}`)),
        tab("Shows", slug ? `/admin/shows/${slug}` : "/admin", (path) => path.startsWith("/admin/shows/")),
        tab("Entries", slug ? `/admin/entries/${slug}` : "/admin", (path) => path.startsWith("/admin/entries/")),
        tab("Sync", slug ? `/admin/lineup-sync/${slug}` : "/admin", (path) => path.startsWith("/admin/lineup-sync/")),
        tab(
          "Participation",
          slug ? `/admin/participant-status/${slug}` : "/admin",
          (path) => path.startsWith("/admin/participant-status/"),
        ),
      ],
    };
  }

  if (pathname.startsWith("/admin/design/") || pathname.startsWith("/admin/edition-theme/")) {
    return {
      label: "Broadcast workflow",
      tabs: [
        tab("Design & broadcast", slug ? `/admin/design/${slug}` : "/admin", (path) => path.startsWith("/admin/design/")),
        tab("Edition theme", slug ? `/admin/edition-theme/${slug}` : "/admin", (path) => path.startsWith("/admin/edition-theme/")),
      ],
    };
  }

  return null;
}

function tab(
  label: string,
  to: string,
  active: (pathname: string) => boolean,
): AdminContextualTab {
  return { label, to, active };
}
