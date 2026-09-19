export type PublicArea = "home" | "explore" | "participate" | "results" | "me" | "help";

export type NavigationVisibility = "primary" | "secondary" | "advanced" | "contextual";

export type PublicAuthScope = "public" | "signed-in" | "hod" | "organizer";

export type PublicDestination = {
  id: string;
  to: string;
  area: PublicArea;
  label: string;
  shortLabel?: string;
  description: string;
  visibility: NavigationVisibility;
  aliases?: string[];
  keywords?: string[];
  auth?: PublicAuthScope;
  parent?: string;
};

export type PublicGlobalArea = {
  id: Exclude<PublicArea, "help">;
  label: string;
  to: string;
  description: string;
};

export const PUBLIC_GLOBAL_AREAS: PublicGlobalArea[] = [
  {
    id: "home",
    label: "Home",
    to: "/",
    description: "What is happening in Solaris Studio now.",
  },
  {
    id: "explore",
    label: "Explore",
    to: "/explore",
    description: "Browse editions, countries, shows and stories.",
  },
  {
    id: "participate",
    label: "Participate",
    to: "/participate",
    description: "Complete the participation task that matters now.",
  },
  {
    id: "results",
    label: "Results",
    to: "/results",
    description: "See, understand and explore published results.",
  },
  {
    id: "me",
    label: "Me",
    to: "/my-solaris",
    description: "Your tasks, country, messages and account.",
  },
];

export const PUBLIC_DESTINATIONS: PublicDestination[] = [
  destination("home", "/", "home", "Home", "What is happening in Solaris Studio now.", "primary", {
    aliases: ["start"],
  }),
  destination(
    "pulse",
    "/pulse",
    "home",
    "Solaris Pulse",
    "Recent public contest and country activity.",
    "secondary",
    { aliases: ["updates", "recent activity"], keywords: ["news", "changes"] },
  ),

  destination(
    "explore",
    "/explore",
    "explore",
    "Explore",
    "Browse Solaris history and public information.",
    "primary",
    { aliases: ["browse", "discover"] },
  ),
  destination("editions", "/editions", "explore", "Editions", "Every Solaris Song Contest edition.", "primary", {
    keywords: ["contest", "archive", "ssc"],
  }),
  destination(
    "countries",
    "/countries",
    "explore",
    "Countries",
    "Delegations, entries and country histories.",
    "primary",
    { keywords: ["country", "delegation"] },
  ),
  destination("shows", "/shows", "explore", "Shows", "Semi-finals, finals, line-ups and broadcasts.", "primary", {
    keywords: ["semi-final", "final", "lineup"],
  }),
  destination("stories", "/stories", "explore", "Stories", "Contest stories and important moments.", "primary", {
    keywords: ["history", "moments"],
  }),
  destination("wiki", "/wiki", "explore", "Wiki", "Detailed country and contest articles.", "secondary", {
    aliases: ["articles"],
  }),
  destination(
    "anniversary",
    "/anniversary",
    "explore",
    "Anniversary",
    "Champions, milestones and Solaris history.",
    "secondary",
    { keywords: ["celebration", "champions"] },
  ),
  destination(
    "archive-games",
    "/archive-games",
    "explore",
    "Archive Games",
    "Play with published Solaris history and results.",
    "advanced",
    { keywords: ["quiz", "game", "history"] },
  ),

  destination(
    "participate",
    "/participate",
    "participate",
    "Participate",
    "See what you can do in the current edition.",
    "primary",
    { aliases: ["take part"] },
  ),
  destination(
    "confirmations",
    "/confirmations",
    "participate",
    "Confirmations",
    "Submit or update a country confirmation.",
    "primary",
    { keywords: ["entry", "response", "submit"] },
  ),
  destination(
    "jury-voting",
    "/jury-voting",
    "participate",
    "Jury voting",
    "Submit the official delegation jury ballot.",
    "primary",
    { aliases: ["jury ballot"], keywords: ["points", "hod"] },
  ),
  destination(
    "televoting",
    "/televoting",
    "participate",
    "Televoting",
    "Vote as a public audience member.",
    "primary",
    { aliases: ["public voting"], keywords: ["vote"] },
  ),
  destination(
    "how-to-vote",
    "/televoting/how-to-vote",
    "participate",
    "How to vote",
    "Read the public voting instructions.",
    "secondary",
    { parent: "televoting", keywords: ["televote", "instructions"] },
  ),
  destination(
    "next-in-line",
    "/next-in-line",
    "participate",
    "Next in Line",
    "Enter or follow the side competition.",
    "secondary",
    { keywords: ["competition"] },
  ),

  destination(
    "results",
    "/results",
    "results",
    "Results",
    "Published rankings and official results.",
    "primary",
    { aliases: ["latest results"], keywords: ["score", "ranking"] },
  ),
  destination(
    "scorecharts",
    "/scorecharts",
    "results",
    "Scorecharts",
    "Detailed published vote breakdowns.",
    "primary",
    { aliases: ["full scorecharts"], keywords: ["votes", "jury", "televote", "points"] },
  ),
  destination(
    "analysis",
    "/analysis",
    "results",
    "Analysis",
    "Understand patterns in published results.",
    "primary",
    { keywords: ["statistics", "voting patterns"] },
  ),
  destination("records", "/records", "results", "Records", "All-time records and milestones.", "primary", {
    keywords: ["all time", "milestone"],
  }),
  destination(
    "relationships",
    "/relationships",
    "results",
    "Voting relationships",
    "Explore repeated voting and competitive patterns.",
    "secondary",
    { aliases: ["Relationships"], keywords: ["similarity", "support", "countries"] },
  ),
  destination(
    "predictions",
    "/predictions",
    "results",
    "Predictions",
    "Build and track show predictions.",
    "secondary",
    { aliases: ["prediction league"], keywords: ["forecast", "predict"] },
  ),
  destination(
    "compare",
    "/compare",
    "results",
    "Compare countries",
    "Place two delegations side by side.",
    "advanced",
    { keywords: ["versus", "comparison"] },
  ),
  destination(
    "result-lab",
    "/result-lab",
    "results",
    "Result Lab",
    "Test how a published result changes under different voting scenarios.",
    "advanced",
    { aliases: ["result simulator"], keywords: ["simulate", "calculator"] },
  ),
  destination(
    "taste-dna",
    "/taste-dna",
    "results",
    "Explore your voting taste",
    "See which juries, televoters and results most closely match your ranking.",
    "advanced",
    { aliases: ["Taste DNA"], keywords: ["voting profile", "taste"] },
  ),
  destination(
    "broadcast-intelligence",
    "/broadcast-intelligence",
    "results",
    "Replay the voting",
    "Replay published result turning points.",
    "advanced",
    {
      aliases: ["Broadcast Intelligence", "Broadcast Replay", "Replay"],
      keywords: ["scoreboard", "reveal"],
    },
  ),
  destination(
    "tools",
    "/tools",
    "results",
    "All result tools",
    "Browse Solaris result, comparison and archive tools.",
    "advanced",
    { aliases: ["Tools"], keywords: ["interactive"] },
  ),

  destination(
    "my-solaris",
    "/my-solaris",
    "me",
    "MySolaris",
    "Your tasks, participation, country tools and messages.",
    "primary",
    { auth: "signed-in", aliases: ["me", "dashboard", "account"] },
  ),
  destination(
    "sign-in",
    "/auth",
    "me",
    "Sign in",
    "Sign in to access MySolaris and country tools.",
    "contextual",
    { auth: "public", keywords: ["login", "account"] },
  ),

  destination("guide", "/guide", "help", "Help", "Plain-language help for using Solaris Studio.", "primary", {
    aliases: ["Guide", "how to use"],
  }),
  destination("rules", "/rules", "help", "Rules", "Official SSC rules and regulations.", "primary", {
    aliases: ["Rulebook"], keywords: ["regulations"],
  }),
  destination(
    "integrity",
    "/integrity",
    "help",
    "Report a concern",
    "Open Trust & Integrity to report a concern or follow a case.",
    "primary",
    { aliases: ["Trust & Integrity", "Integrity"], keywords: ["report", "case", "safety"] },
  ),
  destination(
    "rule-interpretations",
    "/rules/interpretations",
    "help",
    "Rule clarifications",
    "Published official rule clarifications.",
    "secondary",
    { parent: "rules", aliases: ["Interpretations", "Rulings"], keywords: ["precedent"] },
  ),
  destination(
    "rule-changes",
    "/rules/changes",
    "help",
    "Rule changes",
    "Published rulebook versions and change history.",
    "secondary",
    { parent: "rules", aliases: ["Rulebook changes"], keywords: ["release", "history", "governance"] },
  ),
  destination(
    "appeals",
    "/integrity/appeals",
    "help",
    "Appeals",
    "Appeal a decision or continue an existing appeal.",
    "contextual",
    { parent: "integrity", keywords: ["sanction", "review", "decision"] },
  ),
  destination(
    "preclearance",
    "/integrity/preclearance",
    "help",
    "Ask before acting",
    "Request a private rule pre-clearance ruling.",
    "contextual",
    {
      parent: "integrity",
      aliases: ["Preclearance", "Pre-clearance", "Eligibility ruling"],
      keywords: ["advice", "ruling", "allowed"],
    },
  ),
];

export function publicPathMatches(pathname: string, route: string) {
  return route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`);
}

export function publicDestinationsForArea(
  area: PublicArea,
  options: { includeContextual?: boolean } = {},
) {
  return PUBLIC_DESTINATIONS.filter(
    (item) =>
      item.area === area && (options.includeContextual || item.visibility !== "contextual"),
  );
}

export function publicDestinationById(id: string) {
  return PUBLIC_DESTINATIONS.find((item) => item.id === id);
}

export function publicAreaForPath(pathname: string): PublicArea {
  const exact = PUBLIC_DESTINATIONS.filter((item) => publicPathMatches(pathname, item.to)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
  if (exact) return exact.area;

  if (pathname.startsWith("/country-hub")) return "me";
  return "home";
}

export function publicSearchText(item: PublicDestination) {
  return [
    item.label,
    item.shortLabel,
    item.description,
    ...(item.aliases ?? []),
    ...(item.keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function destination(
  id: string,
  to: string,
  area: PublicArea,
  label: string,
  description: string,
  visibility: NavigationVisibility,
  options: Partial<Omit<PublicDestination, "id" | "to" | "area" | "label" | "description" | "visibility">> = {},
): PublicDestination {
  return {
    id,
    to,
    area,
    label,
    description,
    visibility,
    ...options,
  };
}
