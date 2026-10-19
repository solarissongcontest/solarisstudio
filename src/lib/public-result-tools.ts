export type PublicResultTool = {
  to: string;
  title: string;
  description: string;
  eyebrow: string;
};

export type PublicResultToolGroup = {
  title: string;
  description: string;
  tools: readonly PublicResultTool[];
};

export const PUBLIC_RESULT_TOOL_GROUPS = [
  {
    title: "Follow the contest",
    description: "Follow activity, make predictions and compare them with published outcomes.",
    tools: [
      {
        to: "/pulse",
        title: "Solaris Pulse",
        description: "See recent updates, countries you follow, record changes and prediction movement.",
        eyebrow: "Updates",
      },
      {
        to: "/predictions",
        title: "Prediction Arena",
        description: "Make your picks before a round closes, then compare them with the real result later.",
        eyebrow: "Predictions",
      },
      {
        to: "/prediction-league",
        title: "Prediction League",
        description: "See scored prediction standings after the relevant outcomes are published.",
        eyebrow: "Prediction standings",
      },
    ],
  },
  {
    title: "Explore results",
    description: "Understand published outcomes, inspect voting detail or test a hypothetical version.",
    tools: [
      {
        to: "/scorecharts",
        title: "Full Scorecharts",
        description: "See the full voting table for each published show.",
        eyebrow: "Detailed voting",
      },
      {
        to: "/analysis",
        title: "Result Analysis",
        description: "Explore patterns and statistics derived from published Solaris results.",
        eyebrow: "Analysis",
      },
      {
        to: "/voting-dna",
        title: "Country Voting DNA",
        description: "Explore descriptive country voting and result profiles from published history.",
        eyebrow: "Country analytics",
      },
      {
        to: "/result-lab",
        title: "Result Lab",
        description: "Test different jury and televote balances or remove a jury. This never changes the official result.",
        eyebrow: "What-if analysis",
      },
      {
        to: "/taste-dna",
        title: "Taste DNA",
        description: "Rank the songs and see whether your choices are closest to the jury, televote or overall result.",
        eyebrow: "Personal analytics",
      },
      {
        to: "/broadcast-intelligence",
        title: "Broadcast Intelligence",
        description: "Replay a published result and see the biggest jumps, lead changes and turning points.",
        eyebrow: "Results replay",
      },
      {
        to: "/broadcast-intelligence/jury",
        title: "Jury Replay",
        description: "Reveal the published jury votes one jury at a time and watch the scoreboard build.",
        eyebrow: "Jury replay",
      },
    ],
  },
  {
    title: "Explore the archive",
    description: "Explore past Solaris results, records and voting history.",
    tools: [
      {
        to: "/archive-games",
        title: "Archive Games",
        description: "Play quick games made from real past Solaris results.",
        eyebrow: "Games",
      },
      {
        to: "/records",
        title: "Records",
        description: "See all-time records, streaks and milestones.",
        eyebrow: "History",
      },
      {
        to: "/compare",
        title: "Compare countries",
        description: "Put two countries side by side and compare their results and voting history.",
        eyebrow: "Head-to-head",
      },
      {
        to: "/relationships",
        title: "Relationships",
        description: "See which countries often vote for each other or have similar voting habits.",
        eyebrow: "Voting network",
      },
    ],
  },
] as const satisfies readonly PublicResultToolGroup[];
