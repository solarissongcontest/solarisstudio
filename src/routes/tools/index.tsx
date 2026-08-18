import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";

export const Route = createFileRoute("/tools/")({
  head: () => ({ meta: [{ title: "Tools — Solaris Studio" }] }),
  component: ToolsPage,
});

const TOOL_GROUPS = [
  {
    title: "Follow the contest",
    description: "Keep up with what is changing now.",
    tools: [
      {
        to: "/pulse",
        title: "Solaris Pulse",
        description: "Personal updates, follows, record watch and prediction movement.",
        eyebrow: "Updates",
      },
      {
        to: "/predictions",
        title: "Prediction Arena",
        description: "Make predictions before a round locks and compare them with the eventual result.",
        eyebrow: "Predictions",
      },
    ],
  },
  {
    title: "Explore results",
    description: "Open full voting detail or pull the scoreboard apart without changing the official result.",
    tools: [
      {
        to: "/scorecharts",
        title: "Full Scorecharts",
        description: "Browse every published detailed voting matrix directly, show by show.",
        eyebrow: "Detailed voting",
      },
      {
        to: "/result-lab",
        title: "Result Lab",
        description: "Change jury and televote weighting, remove juries and test alternative scoring rules.",
        eyebrow: "What-if analysis",
      },
      {
        to: "/taste-dna",
        title: "Taste DNA",
        description: "Rank a field and see how closely your taste matches juries, televoters and consensus.",
        eyebrow: "Personal analytics",
      },
      {
        to: "/broadcast-intelligence",
        title: "Broadcast Intelligence",
        description: "Replay a result reveal and surface the biggest swings, lead changes and storylines.",
        eyebrow: "Results replay",
      },
      {
        to: "/broadcast-intelligence/jury",
        title: "Jury Replay",
        description: "Reveal published jury ballots one jury at a time and watch the jury scoreboard build live.",
        eyebrow: "Jury replay",
      },
    ],
  },
  {
    title: "Explore the archive",
    description: "Use the contest history instead of letting it gather digital dust.",
    tools: [
      {
        to: "/archive-games",
        title: "Archive Games",
        description: "Play quick games generated from real historical Solaris results.",
        eyebrow: "Games",
      },
      {
        to: "/records",
        title: "Records",
        description: "Browse all-time milestones, streaks and voting records.",
        eyebrow: "History",
      },
      {
        to: "/compare",
        title: "Compare countries",
        description: "Put two delegations side by side across results and voting history.",
        eyebrow: "Head-to-head",
      },
      {
        to: "/relationships",
        title: "Relationships",
        description: "Explore recurring voting links, rivalries and shared taste between countries.",
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
        description="Full scorecharts, predictions, what-if scoreboards, personal taste analytics, result replays and archive tools in one place."
      />

      <div className="space-y-5">
        {TOOL_GROUPS.map((group) => (
          <Panel key={group.title} title={group.title} description={group.description}>
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.tools.map((tool) => (
                <Link
                  key={tool.to}
                  to={tool.to}
                  className="group min-w-0 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-strong focus-visible:bg-surface-strong"
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
