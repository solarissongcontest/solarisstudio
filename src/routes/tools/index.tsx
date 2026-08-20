import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";

export const Route = createFileRoute("/tools/")({
  head: () => ({ meta: [{ title: "Tools — Solaris Studio" }] }),
  component: ToolsPage,
});

const TOOL_GROUPS = [
  {
    title: "Follow the contest",
    description: "See what is happening now.",
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
    ],
  },
  {
    title: "Explore results",
    description: "See full voting details or test a different version of a published result.",
    tools: [
      {
        to: "/scorecharts",
        title: "Full Scorecharts",
        description: "See the full voting table for each published show.",
        eyebrow: "Detailed voting",
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
] as const;

function ToolsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Explore Solaris"
        title="Tools"
        description="Scorecharts, predictions, result tests, comparisons and archive tools are all collected here."
      />

      <div className="space-y-5">
        {TOOL_GROUPS.map((group) => (
          <Panel key={group.title} title={group.title} description={group.description}>
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.tools.map((tool) => (
                <Link
                  key={tool.to}
                  to={tool.to}
                  className="solaris-family-card group min-w-0 rounded-2xl border p-4 transition-colors focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                    {tool.eyebrow}
                  </p>
                  <h2 className="mt-2 break-words font-display text-lg font-semibold">
                    {tool.title}
                  </h2>
                  <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                    {tool.description}
                  </p>
                  <span className="mt-4 inline-block text-xs font-semibold text-primary">
                    Open →
                  </span>
                </Link>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </AppShell>
  );
}
