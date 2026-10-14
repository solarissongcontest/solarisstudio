export type V3OrganizerTabId = "overview" | "tasks" | "control" | "live" | "more";

export const V3_ORGANIZER_TAB_ORDER = [
  "overview",
  "tasks",
  "control",
  "live",
  "more",
] as const satisfies readonly V3OrganizerTabId[];

export function v3OrganizerTabRoot(tab: V3OrganizerTabId) {
  if (tab === "overview") return "/admin/operations";
  if (tab === "tasks") return "/admin/tasks";
  if (tab === "control") return "/admin/control";
  if (tab === "live") return "/admin/control-room";
  return "/admin/more";
}

function isTaskPath(pathname: string) {
  return (
    pathname.startsWith("/admin/tasks") ||
    pathname.startsWith("/admin/action-center") ||
    pathname.startsWith("/admin/action-centre") ||
    pathname.startsWith("/admin/inbox")
  );
}

export function isV3OrganizerLivePath(pathname: string) {
  return (
    pathname.startsWith("/admin/control-room") ||
    pathname.startsWith("/admin/broadcast-rundown") ||
    pathname.startsWith("/admin/incidents")
  );
}

export function isV3OrganizerControlPath(pathname: string) {
  return (
    pathname === "/admin/control" ||
    pathname.startsWith("/admin/countries") ||
    pathname.startsWith("/admin/next-in-line") ||
    pathname.startsWith("/admin/submission-versions") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/televoting/admin") ||
    pathname.startsWith("/admin/entries/") ||
    pathname.startsWith("/admin/shows/") ||
    pathname.startsWith("/admin/lineup-sync/") ||
    pathname.startsWith("/admin/participant-status/") ||
    pathname.startsWith("/admin/hosts") ||
    pathname.startsWith("/admin/eligibility") ||
    pathname.startsWith("/admin/jury/") ||
    pathname.startsWith("/admin/televote/") ||
    pathname.startsWith("/admin/voting-system/") ||
    pathname.startsWith("/admin/friend-voting") ||
    pathname.startsWith("/admin/jury-integrity") ||
    pathname.startsWith("/admin/results") ||
    pathname.startsWith("/admin/voting-lab") ||
    pathname.startsWith("/admin/workflows") ||
    pathname.startsWith("/admin/edition-simulator") ||
    pathname.startsWith("/admin/storytelling") ||
    pathname.startsWith("/admin/media-assets") ||
    pathname.startsWith("/admin/communications") ||
    pathname.startsWith("/admin/publication/") ||
    pathname.startsWith("/admin/design/") ||
    pathname.startsWith("/admin/edition-theme/")
  );
}

export function v3OrganizerTabForPath(pathname: string): V3OrganizerTabId {
  if (pathname.startsWith("/admin/operations")) return "overview";
  if (isTaskPath(pathname)) return "tasks";
  if (isV3OrganizerLivePath(pathname)) return "live";
  if (isV3OrganizerControlPath(pathname)) return "control";
  return "more";
}

export type V3OrganizerControlItem = {
  key: string;
  label: string;
  description: string;
  href: string | null;
  editionScoped: boolean;
};

export type V3OrganizerControlGroup = {
  key: "participation" | "contest" | "voting" | "publication";
  label: string;
  items: readonly V3OrganizerControlItem[];
};

export function buildV3OrganizerControlGroups(slug?: string | null): readonly V3OrganizerControlGroup[] {
  const editionHref = (path: string) => (slug ? path.replace(":slug", slug) : null);

  return [
    {
      key: "participation",
      label: "Participation",
      items: [
        {
          key: "confirmations",
          label: "Confirmations",
          description: "Rounds, responses and participation decisions",
          href: "/confirmations/admin",
          editionScoped: false,
        },
        {
          key: "entries",
          label: "Entries",
          description: "Entry review, readiness and corrections",
          href: editionHref("/admin/entries/:slug"),
          editionScoped: true,
        },
        {
          key: "media",
          label: "Media",
          description: "Assets, artwork and submission media",
          href: "/admin/media-assets",
          editionScoped: false,
        },
      ],
    },
    {
      key: "contest",
      label: "Contest",
      items: [
        {
          key: "delegations",
          label: "Delegations",
          description: "Countries, access and participation status",
          href: "/admin/countries",
          editionScoped: false,
        },
        {
          key: "shows",
          label: "Shows",
          description: "Show setup and contest structure",
          href: editionHref("/admin/shows/:slug"),
          editionScoped: true,
        },
        {
          key: "running-order",
          label: "Running order",
          description: "Line-up placement and synchronization",
          href: editionHref("/admin/lineup-sync/:slug"),
          editionScoped: true,
        },
      ],
    },
    {
      key: "voting",
      label: "Voting",
      items: [
        {
          key: "jury",
          label: "Jury",
          description: "Window state, ballots and jury readiness",
          href: editionHref("/admin/jury/:slug"),
          editionScoped: true,
        },
        {
          key: "televote",
          label: "Televote",
          description: "Voting operations and validation",
          href: editionHref("/admin/televote/:slug"),
          editionScoped: true,
        },
        {
          key: "results",
          label: "Results",
          description: "Validation, official result state and release",
          href: "/admin/results",
          editionScoped: false,
        },
      ],
    },
    {
      key: "publication",
      label: "Publication",
      items: [
        {
          key: "publication",
          label: "Edition publication",
          description: "Release state and publication readiness",
          href: editionHref("/admin/publication/:slug"),
          editionScoped: true,
        },
        {
          key: "communications",
          label: "Announcements",
          description: "Official communications and public updates",
          href: "/admin/communications",
          editionScoped: false,
        },
        {
          key: "design",
          label: "Edition design",
          description: "Artwork, presentation and edition identity",
          href: editionHref("/admin/design/:slug"),
          editionScoped: true,
        },
      ],
    },
  ];
}
