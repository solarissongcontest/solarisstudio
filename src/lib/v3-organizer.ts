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
    pathname.startsWith("/admin/results-reveal") ||
    pathname.startsWith("/admin/incidents")
  );
}

export function isV3OrganizerControlPath(pathname: string) {
  return (
    pathname === "/admin/control" ||
    /^\/admin\/(?:ssc-?\d+|:editionSlug|__edition__)$/i.test(pathname) ||
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
    pathname.startsWith("/admin/workflows") ||
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

export type V3OrganizerControlDomainKey =
  | "delegations"
  | "contest"
  | "voting"
  | "results"
  | "communications"
  | "production";

export type V3OrganizerControlItem = {
  key: string;
  label: string;
  description: string;
  href: string | null;
  editionScoped: boolean;
};

export type V3OrganizerControlGroup = {
  key: V3OrganizerControlDomainKey;
  label: string;
  description: string;
  items: readonly V3OrganizerControlItem[];
};

/**
 * Control deliberately groups existing authoritative workspaces into the
 * canonical Organizer operational domains. It never creates a second mutation
 * surface. Edition-scoped routes fail closed until an explicit edition slug is
 * supplied by OrganizerContext. Legacy tools that cannot yet prove exact
 * edition scope stay outside Control until their System/read contract is ready.
 */
export function buildV3OrganizerControlGroups(
  slug?: string | null,
): readonly V3OrganizerControlGroup[] {
  const editionHref = (path: string) => (slug ? path.replace(":slug", slug) : null);
  const contextHref = (path: string) => (slug ? path : null);

  return [
    {
      key: "delegations",
      label: "Delegations",
      description: "Participation, confirmations, delegation access and history.",
      items: [
        {
          key: "confirmations",
          label: "Confirmations",
          description: "Rounds, requirements, responses and participation decisions",
          href: contextHref("/confirmations/admin"),
          editionScoped: true,
        },
        {
          key: "countries",
          label: "Countries",
          description: "Country readiness, participation and delegation context",
          href: contextHref("/admin/countries"),
          editionScoped: true,
        },
        {
          key: "delegation-access",
          label: "Delegation access",
          description: "Recovery and access controls for delegation workflows",
          href: contextHref("/confirmations/admin/recovery-codes"),
          editionScoped: true,
        },
      ],
    },
    {
      key: "contest",
      label: "Contest",
      description: "Entry review, media, shows, running order and contest readiness.",
      items: [
        {
          key: "entry-review",
          label: "Entry review",
          description: "Review submitted songs, request corrections and verify current entry versions",
          href: contextHref("/confirmations/admin/responses"),
          editionScoped: true,
        },
        {
          key: "media",
          label: "Media review",
          description: "Assets, validation evidence, replacement state and organizer review",
          href: contextHref("/admin/media-assets"),
          editionScoped: true,
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
          description: "Line-up allocation and authoritative running-order operations",
          href: editionHref("/admin/entries/:slug"),
          editionScoped: true,
        },
        {
          key: "participants",
          label: "Participant status",
          description: "Participation, qualification and show-status operations",
          href: editionHref("/admin/participant-status/:slug"),
          editionScoped: true,
        },
        {
          key: "progression",
          label: "Progression",
          description: "Heat progression and line-up synchronization",
          href: editionHref("/admin/lineup-sync/:slug"),
          editionScoped: true,
        },
        {
          key: "eligibility",
          label: "Eligibility",
          description: "Country eligibility checks, blockers and governed overrides",
          href: contextHref("/admin/eligibility"),
          editionScoped: true,
        },
      ],
    },
    {
      key: "voting",
      label: "Voting",
      description: "Voting rounds, Jury, Televote, declarations and integrity.",
      items: [
        {
          key: "voting-overview",
          label: "Voting overview",
          description: "Voting rounds, availability and operational state",
          href: contextHref("/televoting/admin"),
          editionScoped: true,
        },
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
          description: "Voting operations, intake and validation",
          href: editionHref("/admin/televote/:slug"),
          editionScoped: true,
        },
        {
          key: "voting-declarations",
          label: "Declarations",
          description: "Signed voting-integrity declarations",
          href: contextHref("/televoting/admin/integrity-declarations"),
          editionScoped: true,
        },
        {
          key: "voting-integrity",
          label: "Integrity",
          description: "Voting integrity exceptions and review",
          href: contextHref("/admin/jury-integrity"),
          editionScoped: true,
        },
      ],
    },
    {
      key: "results",
      label: "Results & publication",
      description: "Official result lifecycle, validation and public release.",
      items: [
        {
          key: "results",
          label: "Results operations",
          description: "Validation, official result state and release lifecycle",
          href: contextHref("/admin/results"),
          editionScoped: true,
        },
        {
          key: "publication",
          label: "Publication",
          description: "Public visibility, release state and publication readiness",
          href: editionHref("/admin/publication/:slug"),
          editionScoped: true,
        },
        {
          key: "public-vote-results",
          label: "Public vote results",
          description: "Inspect the canonical public-vote result workspace",
          href: contextHref("/televoting/admin/results"),
          editionScoped: true,
        },
      ],
    },
    {
      key: "communications",
      label: "Communications",
      description: "Official notices, announcements and delivery operations.",
      items: [
        {
          key: "communications",
          label: "Official communications",
          description: "Draft, schedule and publish official notices",
          href: contextHref("/admin/communications"),
          editionScoped: true,
        },
      ],
    },
    {
      key: "production",
      label: "Production",
      description: "Configure the edition's broadcast presentation. Live execution stays under Live.",
      items: [
        {
          key: "broadcast",
          label: "Broadcast & design",
          description: "Edition presentation, scoreboard and broadcast configuration",
          href: editionHref("/admin/design/:slug"),
          editionScoped: true,
        },
        {
          key: "theme",
          label: "Edition theme",
          description: "Edition visual theme and presentation configuration",
          href: editionHref("/admin/edition-theme/:slug"),
          editionScoped: true,
        },
      ],
    },
  ];
}