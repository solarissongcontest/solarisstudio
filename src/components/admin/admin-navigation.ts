import {
  BarChart3,
  BellRing,
  BookOpen,
  Calculator,
  ClipboardCheck,
  Database,
  Eye,
  FileClock,
  FileLock2,
  Flag,
  FlaskConical,
  Gavel,
  GitBranch,
  History,
  Images,
  KeyRound,
  LayoutDashboard,
  Layers3,
  ListVideo,
  Mail,
  MapPinned,
  MessageCircleQuestion,
  PlayCircle,
  RadioTower,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Trophy,
  Vote,
  type LucideIcon,
} from "lucide-react";

export type AdminNavigationItem = {
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
  keywords: string;
  active: (pathname: string) => boolean;
};

export type AdminNavigationGroup = {
  label: string;
  description: string;
  items: AdminNavigationItem[];
  quiet?: boolean;
};

export function buildAdminNavigation(slug?: string): AdminNavigationGroup[] {
  const editionHref = slug ? `/admin/${slug}` : "/admin";
  const publishHref = slug ? `/admin/publication/${slug}` : "/admin";
  const broadcastHref = slug ? `/admin/design/${slug}` : "/admin";

  return [
    {
      label: "Current edition",
      description: "The main contest, delegation, voting and publication workspaces.",
      items: [
        item(
          "Overview",
          "Edition status, priorities and next actions.",
          "/admin/operations",
          LayoutDashboard,
          "home status priorities",
          (path) => path.startsWith("/admin/operations"),
        ),
        item(
          "Action Center",
          "Urgent blockers, upcoming deadlines and recent activity.",
          "/admin/action-center",
          BellRing,
          "alerts blockers deadlines tasks",
          (path) =>
            path.startsWith("/admin/action-center") || path.startsWith("/admin/action-centre"),
        ),
        item(
          "Delegations",
          "Country readiness, confirmations and delegation access.",
          "/admin/countries",
          ClipboardCheck,
          "countries confirmations responses delegation",
          (path) => path.startsWith("/admin/countries") || path.startsWith("/confirmations/admin"),
        ),
        item(
          "Contest",
          "Shows, entries, line-ups and participation for the selected edition.",
          editionHref,
          Layers3,
          "shows entries lineup participation contest",
          (path) =>
            (slug ? path === `/admin/${slug}` : false) ||
            path.startsWith("/admin/shows/") ||
            path.startsWith("/admin/entries/") ||
            path.startsWith("/admin/lineup-sync/") ||
            path.startsWith("/admin/participant-status/"),
        ),
        item(
          "Host",
          "Host bids, selection, venues and delivery readiness.",
          "/admin/hosts",
          MapPinned,
          "hosting bids city venue operations",
          (path) => path.startsWith("/admin/hosts"),
        ),
        item(
          "Voting",
          "Voting rules, juries, televote and voting integrity.",
          "/televoting/admin",
          Vote,
          "jury televote public voting rules points",
          (path) =>
            (path.startsWith("/televoting/admin") &&
              !path.startsWith("/televoting/admin/integrity-declarations")) ||
            path.startsWith("/admin/jury/") ||
            path.startsWith("/admin/voting-system/") ||
            path.startsWith("/admin/televote/") ||
            path.startsWith("/admin/friend-voting") ||
            path.startsWith("/admin/jury-integrity"),
        ),
        item(
          "Voting declarations",
          "Inspect the signed voting-integrity declarations.",
          "/televoting/admin/integrity-declarations",
          FileLock2,
          "voting integrity declarations signed",
          (path) => path.startsWith("/televoting/admin/integrity-declarations"),
        ),
        item(
          "Results operations",
          "Review, lock and release the official result lifecycle.",
          "/admin/results",
          Calculator,
          "results calculate review lock publish",
          (path) => path.startsWith("/admin/results") && !path.startsWith("/admin/results-reveal"),
        ),
        item(
          "Storytelling",
          "Edition stories, archive moments and anniversary publishing.",
          "/admin/storytelling",
          BookOpen,
          "stories anniversary narrative archive",
          (path) => path.startsWith("/admin/storytelling"),
        ),
        item(
          "Publish",
          "Control exactly what becomes public and when.",
          publishHref,
          Eye,
          "publication visibility release public",
          (path) => path.startsWith("/admin/publication/"),
        ),
        item(
          "Broadcast",
          "Edition design, scoreboard and live presentation.",
          broadcastHref,
          RadioTower,
          "design theme scoreboard broadcast",
          (path) => path.startsWith("/admin/design/") || path.startsWith("/admin/edition-theme/"),
        ),
      ],
    },
    {
      label: "Operations",
      description: "Live coordination, readiness and communications.",
      items: [
        item(
          "Control Room",
          "Live edition state, incidents, voting and communications.",
          "/admin/control-room",
          ShieldAlert,
          "live command control status",
          (path) => path.startsWith("/admin/control-room"),
        ),
        item(
          "Workflows",
          "Operational workflows, dependencies and task state.",
          "/admin/workflows",
          GitBranch,
          "workflow tasks dependencies execution",
          (path) => path.startsWith("/admin/workflows"),
        ),
        item(
          "Incidents",
          "Open, command and resolve operational incidents.",
          "/admin/incidents",
          Siren,
          "incident sev crisis timeline",
          (path) => path.startsWith("/admin/incidents"),
        ),
        item(
          "Eligibility",
          "Country eligibility checks, blockers and overrides.",
          "/admin/eligibility",
          ShieldCheck,
          "eligibility countries overrides checks",
          (path) => path.startsWith("/admin/eligibility"),
        ),
        item(
          "Media assets",
          "Validate, review and approve contest media.",
          "/admin/media-assets",
          Images,
          "media artwork assets review",
          (path) => path.startsWith("/admin/media-assets"),
        ),
        item(
          "Communications",
          "Draft, schedule and publish official notices.",
          "/admin/communications",
          Mail,
          "notice messages communications publish",
          (path) => path.startsWith("/admin/communications"),
        ),
      ],
    },
    {
      label: "Live & review",
      description: "Specialist rehearsal, reveal and audit tools.",
      items: [
        item(
          "Reveal Director",
          "Plan and rehearse the results reveal sequence.",
          "/admin/results-reveal",
          Sparkles,
          "results reveal strategy sequence",
          (path) => path.startsWith("/admin/results-reveal"),
        ),
        item(
          "Broadcast rundown",
          "Build the live show rundown and cue sequence.",
          "/admin/broadcast-rundown",
          ListVideo,
          "broadcast rundown cues show",
          (path) => path.startsWith("/admin/broadcast-rundown"),
        ),
        item(
          "Submission history",
          "Inspect confirmation versions and restoration history.",
          "/admin/submission-versions",
          History,
          "submissions versions restore history",
          (path) => path.startsWith("/admin/submission-versions"),
        ),
        item(
          "Simulation Lab",
          "Rehearse an edition without changing canonical state.",
          "/admin/edition-simulator",
          PlayCircle,
          "edition simulator rehearsal archive replay",
          (path) => path.startsWith("/admin/edition-simulator"),
        ),
        item(
          "Voting Lab",
          "Test voting scenarios and integrity signals safely.",
          "/admin/voting-lab",
          FlaskConical,
          "voting lab simulation test",
          (path) => path.startsWith("/admin/voting-lab"),
        ),
      ],
    },
    {
      label: "Trust & governance",
      description: "Rules, investigations, evidence and appeal safeguards.",
      items: [
        item(
          "Investigations",
          "Triage reports, review cases and record findings.",
          "/admin/integrity-investigations",
          ShieldCheck,
          "integrity cases reports findings",
          (path) =>
            path === "/admin/integrity" ||
            path.startsWith("/admin/integrity-investigations") ||
            path.startsWith("/admin/integrity-case/") ||
            path.startsWith("/admin/integrity-resolution/"),
        ),
        item(
          "Rule rulings",
          "Answer pre-clearance requests before a delegation acts.",
          "/admin/integrity-preclearance",
          MessageCircleQuestion,
          "preclearance ruling rules advice",
          (path) => path.startsWith("/admin/integrity-preclearance"),
        ),
        item(
          "Appeals",
          "Review sanctions through an independent appeal queue.",
          "/admin/integrity-appeals",
          Gavel,
          "appeals sanctions review",
          (path) => path.startsWith("/admin/integrity-appeals"),
        ),
        item(
          "Evidence",
          "Manage evidence access, retention and deletion lifecycle.",
          "/admin/integrity-evidence",
          Database,
          "evidence files retention cleanup",
          (path) => path.startsWith("/admin/integrity-evidence"),
        ),
        item(
          "Disclosure",
          "Review protected disclosure requests and decisions.",
          "/admin/integrity-disclosure",
          FileLock2,
          "disclosure confidential request",
          (path) => path.startsWith("/admin/integrity-disclosure"),
        ),
        item(
          "Identity access",
          "Control sealed-identity break-glass access.",
          "/admin/integrity-identity",
          KeyRound,
          "identity sealed access break glass",
          (path) => path.startsWith("/admin/integrity-identity"),
        ),
        item(
          "Rules manager",
          "Draft, validate and publish governed rulebook releases.",
          "/admin/rules-manager",
          FileClock,
          "rules rulebook version release governance",
          (path) => path.startsWith("/admin/rules-manager"),
        ),
        item(
          "Interpretations",
          "Publish official rule clarifications and precedent.",
          "/admin/rule-interpretations",
          MessageCircleQuestion,
          "interpretations clarification precedent",
          (path) => path.startsWith("/admin/rule-interpretations"),
        ),
        item(
          "Public rules",
          "Open the rulebook exactly as visitors see it.",
          "/rules",
          BookOpen,
          "public rules rulebook",
          (path) => path.startsWith("/rules"),
        ),
      ],
    },
    {
      label: "Workspace",
      description: "Accounts, editions, rollout controls and help.",
      quiet: true,
      items: [
        item(
          "Administration",
          "Accounts, HOD history, predictions and system tools.",
          "/admin/more",
          Settings2,
          "accounts history settings diagnostics",
          (path) => path.startsWith("/admin/more"),
        ),
        item(
          "Feature rollout",
          "See which Studio features are enabled or still planned.",
          "/admin/feature-rollout",
          Flag,
          "feature flags rollout enabled planned",
          (path) => path.startsWith("/admin/feature-rollout"),
        ),
        item(
          "All editions",
          "Create, archive and switch between SSC editions.",
          "/admin",
          Trophy,
          "edition library create archive",
          (path) => path === "/admin" || path === "/admin/",
        ),
        item(
          "Organizer guide",
          "Plain-language help for the main organizer workflows.",
          "/admin/guide",
          BookOpen,
          "guide help instructions",
          (path) => path.startsWith("/admin/guide"),
        ),
        item(
          "Country accounts",
          "Manage the sign-in account for each delegation.",
          "/admin/country-accounts",
          KeyRound,
          "country delegation accounts access",
          (path) => path.startsWith("/admin/country-accounts"),
        ),
        item(
          "HOD history",
          "Review Head of Delegation assignments by edition.",
          "/admin/hod-history",
          History,
          "head delegation history assignments",
          (path) => path.startsWith("/admin/hod-history"),
        ),
        item(
          "Predictions",
          "Create and manage visitor prediction rounds.",
          "/admin/predictions",
          Sparkles,
          "prediction rounds engagement",
          (path) => path.startsWith("/admin/predictions"),
        ),
        item(
          "Anniversary settings",
          "Manage anniversary content and milestones.",
          "/admin/anniversary",
          Trophy,
          "anniversary settings milestones",
          (path) => path === "/admin/anniversary",
        ),
        item(
          "Anniversary dates",
          "Manage anniversary dates and archive moments.",
          "/admin/anniversary-dates",
          FileClock,
          "anniversary dates history",
          (path) => path.startsWith("/admin/anniversary-dates"),
        ),
        item(
          "Beta 2 feedback",
          "Review current public-site usability feedback and comparisons.",
          "/admin/beta2-feedback",
          BarChart3,
          "beta feedback usability",
          (path) => path.startsWith("/admin/beta2-feedback"),
        ),
        item(
          "Beta 1 archive",
          "Read the closed Beta 1 responses and benchmarks.",
          "/admin/beta1-feedback",
          History,
          "beta archive feedback benchmark",
          (path) => path.startsWith("/admin/beta1-feedback"),
        ),
        item(
          "Organizer acceptance test",
          "Run and record the main organizer acceptance checks.",
          "/admin/beta-test",
          ClipboardCheck,
          "qa acceptance testing",
          (path) => path.startsWith("/admin/beta-test"),
        ),
        item(
          "Organizer beta coverage",
          "Review organizer test coverage and reported bugs.",
          "/admin/admin-beta-feedback",
          BarChart3,
          "qa beta coverage bugs",
          (path) => path.startsWith("/admin/admin-beta-feedback"),
        ),
        item(
          "System health",
          "Inspect data synchronization and integration health.",
          "/admin/sync-health",
          Settings2,
          "diagnostics sync health",
          (path) => path.startsWith("/admin/sync-health"),
        ),
        item(
          "System settings",
          "Manage deadlines, audit history and maintenance controls.",
          "/admin/system",
          Settings2,
          "settings deadlines audit maintenance",
          (path) => path.startsWith("/admin/system"),
        ),
      ],
    },
  ];
}

function item(
  label: string,
  description: string,
  to: string,
  icon: LucideIcon,
  keywords: string,
  active: (pathname: string) => boolean,
): AdminNavigationItem {
  return { label, description, to, icon, keywords, active };
}
