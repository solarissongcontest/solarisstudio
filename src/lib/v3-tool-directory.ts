export type PublicTool = {
  to: string;
  title: string;
  description: string;
  eyebrow: string;
};

export type PublicToolGroup = {
  id: "follow" | "results" | "archive";
  title: string;
  description: string;
  tools: readonly PublicTool[];
};

/** Existing public tool destinations, kept as navigation rather than authorizations. */
export const PUBLIC_TOOL_GROUPS: readonly PublicToolGroup[] = [
  {
    id: "follow",
    title: "Follow the contest",
    description: "See what is happening now.",
    tools: [
      { to: "/calendar", title: "Show calendar", description: "Check published show times and save an edition schedule to your phone or desktop calendar.", eyebrow: "Public schedule" },
      { to: "/pulse", title: "Solaris Pulse", description: "See recent updates, countries you follow, record changes and prediction movement.", eyebrow: "Updates" },
      { to: "/predictions", title: "Prediction Arena", description: "Make your picks before a round closes, then compare them with the real result later.", eyebrow: "Predictions" },
    ],
  },
  {
    id: "results",
    title: "Explore results",
    description: "See full voting details or test a different version of a published result.",
    tools: [
      { to: "/scorecharts", title: "Full Scorecharts", description: "See the full voting table for each published show.", eyebrow: "Detailed voting" },
      { to: "/result-lab", title: "Result Lab", description: "Test different jury and televote balances or remove a jury. This never changes the official result.", eyebrow: "What-if analysis" },
      { to: "/taste-dna", title: "Taste DNA", description: "Rank the songs and see whether your choices are closest to the jury, televote or overall result.", eyebrow: "Personal analytics" },
      { to: "/broadcast-intelligence", title: "Broadcast Intelligence", description: "Replay a published result and see the biggest jumps, lead changes and turning points.", eyebrow: "Results replay" },
      { to: "/broadcast-intelligence/jury", title: "Jury Replay", description: "Reveal the published jury votes one jury at a time and watch the scoreboard build.", eyebrow: "Jury replay" },
    ],
  },
  {
    id: "archive",
    title: "Explore the archive",
    description: "Explore past Solaris results, records and voting history.",
    tools: [
      { to: "/archive-games", title: "Archive Games", description: "Play quick games made from real past Solaris results.", eyebrow: "Games" },
      { to: "/records", title: "Records", description: "See all-time records, streaks and milestones.", eyebrow: "History" },
      { to: "/compare", title: "Compare countries", description: "Put two countries side by side and compare their results and voting history.", eyebrow: "Head-to-head" },
      { to: "/relationships", title: "Relationships", description: "See which countries often vote for each other or have similar voting habits.", eyebrow: "Voting network" },
    ],
  },
];

export type PublicToolArea = PublicToolGroup["id"] | "all";

export function filterPublicToolGroups(
  groups: readonly PublicToolGroup[],
  search: string,
  area: PublicToolArea = "all",
): PublicToolGroup[] {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return groups
    .filter((group) => area === "all" || group.id === area)
    .map((group) => {
      const groupMatches = terms.every((term) =>
        `${group.title} ${group.description}`.toLowerCase().includes(term),
      );
      const tools = group.tools.filter((tool) =>
        groupMatches || terms.every((term) =>
          `${tool.title} ${tool.description} ${tool.eyebrow}`.toLowerCase().includes(term),
        ),
      );
      return { ...group, tools };
    })
    .filter((group) => group.tools.length > 0);
}

export function countPublicTools(groups: readonly PublicToolGroup[]) {
  return groups.reduce((total, group) => total + group.tools.length, 0);
}
