export type SolarisAssistantCommand = {
  id: string;
  label: string;
  description: string;
  route: string;
  keywords: string[];
  capability?: string;
};

export const SOLARIS_ASSISTANT_COMMANDS: SolarisAssistantCommand[] = [
  {
    id: "entries-missing-song",
    label: "Entries missing a song",
    description: "Open the selected edition entry workspace to review missing song data.",
    route: "/admin/entries",
    keywords: ["entries missing song", "missing songs", "entry missing", "song missing"],
    capability: "entry.read",
  },
  {
    id: "publication-status",
    label: "Publication status",
    description: "Open publication controls for the selected edition.",
    route: "/admin/publication",
    keywords: ["publication status", "publish status", "what is public", "publication"],
    capability: "results.preview",
  },
  {
    id: "integrity-cases",
    label: "Unresolved Integrity cases",
    description: "Open the Trust & Integrity investigation queue.",
    route: "/admin/integrity-investigations",
    keywords: ["integrity cases", "unresolved cases", "reports", "investigations"],
    capability: "integrity.manage",
  },
  {
    id: "confirmation-review",
    label: "Confirmation responses waiting for review",
    description: "Open submitted delegation confirmations.",
    route: "/confirmations/admin/responses",
    keywords: ["confirmations waiting", "confirmation review", "responses review", "pending confirmations"],
    capability: "confirmation.manage",
  },
  {
    id: "edition-health",
    label: "Edition health",
    description: "Open the Organizer overview and current operational health.",
    route: "/admin/operations",
    keywords: ["edition health", "needs attention", "what needs attention", "status", "overview"],
    capability: "edition.read",
  },
  {
    id: "voting-state",
    label: "Voting state",
    description: "Open the voting workspace for the selected edition.",
    route: "/televoting/admin",
    keywords: ["voting state", "voting status", "jury status", "televote status"],
    capability: "edition.read",
  },
  {
    id: "results-status",
    label: "Results operations",
    description: "Open the selected edition result lifecycle.",
    route: "/admin/results",
    keywords: ["results status", "result status", "results operation", "results"],
    capability: "results.preview",
  },
  {
    id: "inbox",
    label: "Organizer Inbox",
    description: "Open unresolved operational items and official notices.",
    route: "/admin/inbox",
    keywords: ["inbox", "notifications", "messages", "notices", "alerts"],
    capability: "edition.read",
  },
];

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function matchSolarisAssistantCommands(input: string, limit = 5) {
  const query = normalize(input);
  if (!query) return SOLARIS_ASSISTANT_COMMANDS.slice(0, limit);

  const queryTerms = query.split(" ");
  return SOLARIS_ASSISTANT_COMMANDS
    .map((command) => {
      const text = normalize([command.label, command.description, ...command.keywords].join(" "));
      let score = 0;
      if (command.keywords.some((keyword) => query.includes(normalize(keyword)))) score += 10;
      for (const term of queryTerms) if (text.includes(term)) score += 1;
      return { command, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label))
    .slice(0, limit)
    .map((row) => row.command);
}
