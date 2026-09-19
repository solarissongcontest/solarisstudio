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
  editionLabel = "Current edition",
): AdminContextualSection | null {
  const domain = buildAdminDomainNavigation(slug, editionLabel).find((item) => item.active(pathname));
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
  const designHref = slug ? `/admin/design/${slug}` : "/admin/storytelling";

  const overviewActive = (path: string) => Boolean(slug && path === `/admin/${slug}`);

  const delegationsActive = (path: string) =>
    path.startsWith("/admin/countries") ||
    path.startsWith("/confirmations/admin") ||
    path.startsWith("/admin/submission-versions");

  const contestActive = (path: string) =>
    path.startsWith("/admin/shows/") ||
    path.startsWith("/admin/entries/") ||
    path.startsWith("/admin/lineup-sync/") ||
    path.startsWith("/admin/participant-status/") ||
    path.startsWith("/admin/hosts") ||
    path.startsWith("/admin/eligibility");

  const votingActive = (path: string) =>
    path.startsWith("/televoting/admin") ||
    path.startsWith("/admin/jury/") ||
    path.startsWith("/admin/voting-system/") ||
    path.startsWith("/admin/televote/") ||
    path.startsWith("/admin/friend-voting") ||
    path.startsWith("/admin/jury-integrity") ||
    (path.startsWith("/admin/results") && !path.startsWith("/admin/results-reveal")) ||
    path.startsWith("/admin/voting-lab");

  const showActive = (path: string) =>
    path.startsWith("/admin/control-room") ||
    path.startsWith("/admin/workflows") ||
    path.startsWith("/admin/incidents") ||
    path.startsWith("/admin/broadcast-rundown") ||
    path.startsWith("/admin/edition-simulator") ||
    path.startsWith("/admin/results-reveal");

  const publishActive = (path: string) =>
    path.startsWith("/admin/storytelling") ||
    path.startsWith("/admin/media-assets") ||
    path.startsWith("/admin/communications") ||
    path.startsWith("/admin/publication/") ||
    path.startsWith("/admin/design/") ||
    path.startsWith("/admin/edition-theme/");

  switch (domainId) {
    case "home":
    case "inbox":
      return [];
    case "edition":
      return [
        tab("Overview", slug ? `/admin/${slug}` : "/admin", overviewActive),
        tab("Delegations", "/admin/countries", delegationsActive),
        tab("Contest", slug ? `/admin/shows/${slug}` : contestHref, contestActive),
        tab("Voting & results", "/televoting/admin", votingActive),
        tab("Live", "/admin/control-room", showActive),
        tab("Publish", publishHref, publishActive),
      ];
    case "rules-cases":
      return [
        tab(
          "Incoming",
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
          "Rules",
          "/admin/rules-manager",
          (path) => path.startsWith("/admin/rules-manager") || path.startsWith("/admin/rule-interpretations"),
        ),
        tab(
          "Privacy",
          "/admin/integrity-disclosure",
          (path) => path.startsWith("/admin/integrity-disclosure") || path.startsWith("/admin/integrity-identity"),
        ),
      ];
    case "administration":
      return [
        tab("Overview", "/admin/more", (path) => path.startsWith("/admin/more")),
        tab(
          "People & access",
          "/admin/access-permissions",
          (path) =>
            path.startsWith("/admin/access-permissions") ||
            path.startsWith("/admin/country-accounts") ||
            path.startsWith("/admin/hod-history"),
        ),
        tab("Editions", "/admin", (path) => path === "/admin" || path === "/admin/"),
        tab(
          "System",
          "/admin/system",
          (path) =>
            path.startsWith("/admin/system") ||
            path.startsWith("/admin/sync-health") ||
            path.startsWith("/admin/feature-rollout") ||
            path.startsWith("/admin/anniversary"),
        ),
        tab(
          "QA",
          "/admin/admin-beta-feedback",
          (path) =>
            path.startsWith("/admin/beta") ||
            path.startsWith("/admin/admin-beta") ||
            path.startsWith("/admin/public-ux"),
        ),
      ];
  }
}

function workflowTabs(pathname: string, slug?: string): AdminContextualWorkflow | null {
  if (
    pathname.startsWith("/admin/countries") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/admin/submission-versions")
  ) {
    return {
      label: "Delegations workflow",
      tabs: [
        tab(
          "Countries",
          "/admin/countries",
          (path) => path.startsWith("/admin/countries"),
        ),
        tab(
          "Confirmations",
          "/confirmations/admin",
          (path) => path === "/confirmations/admin" || path === "/confirmations/admin/",
        ),
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
        tab(
          "History",
          "/admin/submission-versions",
          (path) => path.startsWith("/admin/submission-versions"),
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
    pathname.startsWith("/admin/jury-integrity") ||
    (pathname.startsWith("/admin/results") && !pathname.startsWith("/admin/results-reveal")) ||
    pathname.startsWith("/admin/voting-lab")
  ) {
    return {
      label: "Voting workflow",
      tabs: [
        tab("Overview", "/televoting/admin", (path) => path === "/televoting/admin" || path === "/televoting/admin/"),
        tab("Rules", slug ? `/admin/voting-system/${slug}` : "/admin", (path) => path.startsWith("/admin/voting-system/")),
        tab("Jury", slug ? `/admin/jury/${slug}` : "/admin", (path) => path.startsWith("/admin/jury/") || path.startsWith("/admin/jury-integrity")),
        tab(
          "Public vote",
          "/televoting/admin/rounds",
          (path) =>
            path.startsWith("/televoting/admin/rounds") ||
            path.startsWith("/admin/televote/"),
        ),
        tab(
          "Integrity",
          "/televoting/admin/integrity",
          (path) =>
            path.startsWith("/televoting/admin/integrity") ||
            path.startsWith("/televoting/admin/anti-abuse") ||
            path.startsWith("/televoting/admin/result-integrity") ||
            path.startsWith("/admin/friend-voting") ||
            path.startsWith("/televoting/admin/intelligence"),
        ),
        tab(
          "Results",
          "/admin/results",
          (path) =>
            (path.startsWith("/admin/results") && !path.startsWith("/admin/results-reveal")) ||
            path.startsWith("/televoting/admin/results") ||
            path.startsWith("/televoting/admin/combined") ||
            path.startsWith("/televoting/admin/backtest"),
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
        tab("Hosting", "/admin/hosts", (path) => path.startsWith("/admin/hosts")),
        tab("Eligibility", "/admin/eligibility", (path) => path.startsWith("/admin/eligibility")),
      ],
    };
  }

  if (
    pathname.startsWith("/admin/control-room") ||
    pathname.startsWith("/admin/workflows") ||
    pathname.startsWith("/admin/incidents") ||
    pathname.startsWith("/admin/broadcast-rundown") ||
    pathname.startsWith("/admin/edition-simulator") ||
    pathname.startsWith("/admin/results-reveal")
  ) {
    return {
      label: "Live workflow",
      tabs: [
        tab("Control room", "/admin/control-room", (path) => path.startsWith("/admin/control-room")),
        tab("Workflows", "/admin/workflows", (path) => path.startsWith("/admin/workflows")),
        tab("Incidents", "/admin/incidents", (path) => path.startsWith("/admin/incidents")),
        tab("Rundown", "/admin/broadcast-rundown", (path) => path.startsWith("/admin/broadcast-rundown")),
        tab("Reveal", "/admin/results-reveal", (path) => path.startsWith("/admin/results-reveal")),
        tab("Rehearsal", "/admin/edition-simulator", (path) => path.startsWith("/admin/edition-simulator")),
      ],
    };
  }

  if (
    pathname.startsWith("/admin/publication/") ||
    pathname.startsWith("/admin/communications") ||
    pathname.startsWith("/admin/media-assets") ||
    pathname.startsWith("/admin/storytelling") ||
    pathname.startsWith("/admin/design/") ||
    pathname.startsWith("/admin/edition-theme/")
  ) {
    return {
      label: "Publish workflow",
      tabs: [
        tab("Release", slug ? `/admin/publication/${slug}` : "/admin", (path) => path.startsWith("/admin/publication/")),
        tab("Communications", "/admin/communications", (path) => path.startsWith("/admin/communications")),
        tab("Media", "/admin/media-assets", (path) => path.startsWith("/admin/media-assets")),
        tab("Stories", "/admin/storytelling", (path) => path.startsWith("/admin/storytelling")),
        tab("Design", slug ? `/admin/design/${slug}` : "/admin", (path) => path.startsWith("/admin/design/") || path.startsWith("/admin/edition-theme/")),
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
