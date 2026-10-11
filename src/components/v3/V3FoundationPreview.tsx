import {
  Bell,
  Compass,
  Home,
  Radio,
  Search,
  Trophy,
  UserRound,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { SolarisTask } from "@/lib/participation-os";
import {
  projectV3Bootstrap,
  type V3BootstrapProjection,
  type V3BootstrapSource,
} from "@/lib/v3-bootstrap";
import type { V3ActionProjection } from "@/lib/v3-experience";
import {
  V3ActionCard,
  V3FoundationShell,
  V3Journey,
  V3JourneyStep,
  V3NowCard,
  V3Progress,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  V3TopContext,
} from "./V3Foundation";

const PREVIEW_NOW = "2026-10-11T16:48:00.000Z";

type PreviewTab = "home" | "explore" | "participate" | "results" | "me";
type PreviewScenario = "action" | "calm" | "live" | "results";
type PreviewNavItem = {
  id: PreviewTab;
  label: string;
  icon: LucideIcon;
  emphasis?: boolean;
};

const NAV: readonly PreviewNavItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "participate", label: "Participate", icon: Vote, emphasis: true },
  { id: "results", label: "Results", icon: Trophy },
  { id: "me", label: "Me", icon: UserRound },
];

const SCENARIOS: readonly { id: PreviewScenario; label: string }[] = [
  { id: "action", label: "Action" },
  { id: "calm", label: "Calm" },
  { id: "live", label: "Live" },
  { id: "results", label: "Results" },
];

function completedTask(
  id: string,
  kind: "confirmation" | "entry" | "media" | "jury",
  title: string,
  description: string,
  route: string,
): SolarisTask {
  return {
    id,
    editionId: "22",
    kind,
    title,
    description,
    state: "completed",
    importance: "required",
    blocking: false,
    actionRequired: false,
    opensAt: null,
    deadline: null,
    route,
    priority: 60,
    why: "Representative canonical completion evidence for the isolated V3 preview.",
  };
}

function responsibilityBase() {
  return [
    completedTask(
      "confirmation:ssc22",
      "confirmation",
      "Confirmation",
      "Participation confirmed",
      "/confirmations",
    ),
    completedTask("entry:ssc22", "entry", "Entry", "Submitted and verified", "/my-solaris/entry"),
    completedTask("media:ssc22", "media", "Media", "All required assets accepted", "/my-solaris/entry"),
  ] satisfies SolarisTask[];
}

function previewTasks(scenario: PreviewScenario): SolarisTask[] {
  const tasks = responsibilityBase();

  if (scenario === "action") {
    tasks.push({
      id: "jury:ssc22-sf1",
      editionId: "22",
      kind: "jury",
      title: "Jury voting",
      description: "Continue your official Semi-final 1 ballot.",
      state: "needs_attention",
      importance: "required",
      blocking: true,
      actionRequired: true,
      opensAt: "2026-10-10T18:00:00.000Z",
      deadline: "2026-10-11T20:00:00.000Z",
      route: "/jury-voting",
      priority: 120,
      why: "Your delegation has an open required jury ballot.",
    });
  } else {
    tasks.push(
      completedTask(
        "jury:ssc22-sf1",
        "jury",
        "Jury",
        "Official ballot submitted",
        "/jury-voting",
      ),
    );
  }

  tasks.push({
    id: "televote:ssc22-sf1",
    editionId: "22",
    kind: "televote",
    title: "Public voting",
    description:
      scenario === "live"
        ? "Voting is open during the live show."
        : scenario === "results"
          ? "Public voting has closed."
          : "Voting opens during the live show.",
    state: scenario === "live" ? "available" : scenario === "results" ? "finished" : "upcoming",
    importance: "optional",
    blocking: false,
    actionRequired: false,
    opensAt: "2026-10-12T18:30:00.000Z",
    deadline: "2026-10-12T18:45:00.000Z",
    route: "/televoting",
    priority: 35,
    why: "Public televoting is optional participation, not an official delegation responsibility.",
  });

  return tasks;
}

function previewSource(scenario: PreviewScenario): V3BootstrapSource {
  const live = scenario === "live";
  const results = scenario === "results";

  return {
    schemaVersion: 1,
    generatedAt: PREVIEW_NOW,
    serverTime: PREVIEW_NOW,
    identity: { userId: "preview-user", displayName: "Arthur" },
    context: {
      editionId: "22",
      editionLabel: "SSC 22",
      delegationId: "oland",
      delegationName: "Oland",
    },
    capabilities: ["confirmation.manage", "entry.submit", "jury.vote"],
    domain: {
      edition: results ? "completed" : "active",
      confirmation: "closed",
      entry: "verified",
      show: live ? "live" : results ? "ended" : "scheduled",
      jury: scenario === "action" ? "open" : "finalized",
      televote: live ? "open" : results ? "validated" : "upcoming",
      results: results ? "published" : "hidden",
      publication: results ? "public" : "scheduled",
    },
    tasks: previewTasks(scenario),
  };
}

function urgencyTone(action: V3ActionProjection | null) {
  if (!action) return "neutral" as const;
  return action.urgency === "immediate" || action.urgency === "high"
    ? ("urgent" as const)
    : ("required" as const);
}

function experienceLabel(mode: V3BootstrapProjection["experience"]["mode"]) {
  switch (mode) {
    case "show-day":
      return "Show day";
    case "live":
      return "Live";
    case "live-voting":
      return "Live voting";
    case "voting":
      return "Voting open";
    case "results":
      return "Results";
    case "post-edition":
      return "Edition complete";
    case "planning":
      return "Planning";
    case "archived":
      return "Archived";
    case "cancelled":
      return "Cancelled";
    case "active":
      return "Pre-show";
  }
}

export function V3FoundationPreview() {
  const [tab, setTab] = useState<PreviewTab>("home");
  const [scenario, setScenario] = useState<PreviewScenario>("action");
  const bootstrap = useMemo(() => projectV3Bootstrap(previewSource(scenario)), [scenario]);

  return (
    <V3FoundationShell>
      <V3TopContext
        edition={bootstrap.context.editionLabel ?? "Solaris"}
        phase={tab === "participate" ? "Participation" : experienceLabel(bootstrap.experience.mode)}
        actions={
          <>
            <button className="v3-icon-button" type="button" aria-label="Search preview">
              <Search className="size-[18px]" aria-hidden="true" />
            </button>
            <button className="v3-icon-button" type="button" aria-label="Notifications preview">
              <Bell className="size-[18px]" aria-hidden="true" />
            </button>
          </>
        }
      />

      <div className="relative z-[2] mx-auto flex w-full max-w-[48rem] gap-1 overflow-x-auto px-4 pt-2" aria-label="Preview scenario">
        {SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setScenario(item.id)}
            aria-pressed={scenario === item.id}
            className="min-h-9 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 text-[0.68rem] font-semibold text-white/55 aria-pressed:border-white/[0.18] aria-pressed:bg-white/[0.09] aria-pressed:text-white"
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "home" ? <HomePreview bootstrap={bootstrap} /> : null}
      {tab === "participate" ? <ParticipatePreview bootstrap={bootstrap} /> : null}
      {tab === "explore" ? <ExplorePreview /> : null}
      {tab === "results" ? <ResultsPreview bootstrap={bootstrap} /> : null}
      {tab === "me" ? <MePreview /> : null}

      <nav className="v3-bottom-nav" aria-label="V3 foundation preview navigation" role="tablist">
        {NAV.map(({ id, label, icon: Icon, emphasis }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="v3-bottom-nav__item"
            aria-selected={tab === id}
            aria-label={label}
            data-emphasis={emphasis ? "true" : undefined}
            onClick={() => setTab(id)}
          >
            <Icon className="size-[19px]" strokeWidth={tab === id ? 2.3 : 1.9} aria-hidden="true" />
            <span className="v3-bottom-nav__label">{label}</span>
          </button>
        ))}
      </nav>
    </V3FoundationShell>
  );
}

function HomePreview({ bootstrap }: { bootstrap: V3BootstrapProjection }) {
  const primary = bootstrap.attention.primary;
  const attentionTitle = bootstrap.attention.badgeCount
    ? `${bootstrap.attention.badgeCount} thing${bootstrap.attention.badgeCount === 1 ? "" : "s"} need your attention`
    : "You're all caught up";

  const now = (() => {
    switch (bootstrap.home.primaryMode) {
      case "attention":
        return {
          eyebrow: "Right now",
          title: attentionTitle,
          count: bootstrap.attention.badgeCount as number | "✓",
          child: primary ? (
            <V3ActionCard
              title={primary.title}
              description={primary.description}
              tone={urgencyTone(primary)}
              meta={
                <>
                  <span>8 / 15 ranked</span>
                  <span>Closes in 3h 12m</span>
                </>
              }
            />
          ) : null,
        };
      case "live-voting":
        return {
          eyebrow: "Live now",
          title: "Semi-final 1 is live",
          count: "✓" as const,
          child: (
            <V3ActionCard
              title="Voting is open"
              description="Follow the live show or open the optional public vote."
              icon={Radio}
              tone="neutral"
            />
          ),
        };
      case "live":
        return {
          eyebrow: "Live now",
          title: "Semi-final 1 is live",
          count: "✓" as const,
          child: null,
        };
      case "results":
        return {
          eyebrow: "Results",
          title: "SSC 22 results are in",
          count: "✓" as const,
          child: null,
        };
      case "results-hidden":
        return {
          eyebrow: "Results",
          title: "SSC 22 results are available",
          count: "✓" as const,
          child: null,
        };
      case "show-day":
        return {
          eyebrow: "Tonight",
          title: "Semi-final 1 starts soon",
          count: "✓" as const,
          child: null,
        };
      case "voting":
        return {
          eyebrow: "Right now",
          title: "Voting is open",
          count: "✓" as const,
          child: null,
        };
      case "post-edition":
        return {
          eyebrow: "Edition complete",
          title: "SSC 22 is complete",
          count: "✓" as const,
          child: null,
        };
      case "planning":
        return {
          eyebrow: "Coming next",
          title: "A new Solaris edition is taking shape",
          count: "✓" as const,
          child: null,
        };
      case "cancelled":
        return {
          eyebrow: "Edition update",
          title: "This edition is not continuing",
          count: "✓" as const,
          child: null,
        };
      case "calm":
        return {
          eyebrow: "Right now",
          title: "You're all caught up",
          count: "✓" as const,
          child: null,
        };
    }
  })();

  const contestStatus = bootstrap.experience.resultsPublic
    ? { label: "Results", tone: "success" as const }
    : bootstrap.experience.live
      ? { label: "Live", tone: "live" as const }
      : { label: "Pre-show", tone: "progress" as const };

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Foundation preview"
        title={bootstrap.home.primaryMode === "attention" ? "Good evening" : "Solaris now"}
        description="The structure stays stable. Canonical state changes emphasis without making users relearn Home every few hours."
      />

      <V3NowCard eyebrow={now.eyebrow} title={now.title} count={now.count}>
        {now.child}
      </V3NowCard>

      <V3Section
        title="Current contest"
        meta={<V3StatusChip tone={contestStatus.tone}>{contestStatus.label}</V3StatusChip>}
      >
        <V3Surface level="raised" className="p-5">
          <p className="v3-kicker">Solaris Song Contest 22</p>
          <h2 className="mt-2 text-[1.55rem] font-bold leading-[1.02] tracking-[-0.045em]">
            {bootstrap.experience.resultsPublic
              ? "The final result is official"
              : bootstrap.experience.live
                ? "Semi-final 1 is happening now"
                : "Semi-final 1 tomorrow"}
          </h2>
          <p className="mt-2 text-[0.78rem] leading-5 text-white/55">Tetlehamn · 20:00 CEST</p>
          <div className="mt-5 v3-preview-meta-grid">
            <V3Stat value="66" label="Delegations" />
            <V3Stat value="18" label="Semi-finalists" />
            <V3Stat value={bootstrap.experience.live ? "12 / 18" : "20:00"} label={bootstrap.experience.live ? "Now" : "Show time"} />
            <V3Stat value={bootstrap.experience.resultsPublic ? "Official" : bootstrap.experience.live ? "Live" : "1 day"} label={bootstrap.experience.resultsPublic ? "Status" : bootstrap.experience.live ? "Status" : "Until show"} />
          </div>
        </V3Surface>
      </V3Section>

      <V3Section title="Coming up" meta="Next 3">
        <div className="v3-preview-grid">
          <V3ActionCard title="Semi-final 1" description="Tomorrow · 20:00 CEST" tone="neutral" />
          <V3ActionCard title="Public voting" description="Opens during the live show" tone="neutral" />
        </div>
      </V3Section>

      <V3Section title="Latest" meta="Quiet by default">
        <V3Surface className="p-4">
          <p className="text-sm font-semibold">Running order published</p>
          <p className="mt-1 text-xs leading-5 text-white/48">SSC 22 · Semi-final 1 is ready to explore.</p>
        </V3Surface>
      </V3Section>
    </V3Screen>
  );
}

function ParticipatePreview({ bootstrap }: { bootstrap: V3BootstrapProjection }) {
  const required =
    bootstrap.actions.find(
      (action) => action.deliveryClass === "required" && action.actionRequired,
    ) ?? null;
  const optional = bootstrap.actions.find((action) => action.deliveryClass === "optional") ?? null;
  const complete = bootstrap.journey.filter((step) => step.state === "complete").length;

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="SSC 22"
        title="Your participation"
        description="Responsibilities come from the same canonical task evidence as Home. Optional participation remains visibly separate."
      />

      <V3Section title="Your responsibilities" meta={`${complete} of ${bootstrap.journey.length} complete`}>
        <V3Journey>
          {bootstrap.journey.map((step) => (
            <V3JourneyStep
              key={step.id}
              title={step.title}
              detail={step.detail}
              state={step.state}
              trailing={step.state === "complete" ? "Done" : step.responsibility === "jury" ? "8 / 15" : "Action"}
            />
          ))}
        </V3Journey>
      </V3Section>

      {required ? (
        <V3Section title="Needs attention" meta={<V3StatusChip tone="required">Required</V3StatusChip>}>
          <V3Surface level="raised" className="p-3">
            <V3ActionCard
              title={required.title}
              description={required.description}
              tone={urgencyTone(required)}
              trailing
              meta={
                <>
                  <span>Due today · 20:00</span>
                  <span>Oland</span>
                </>
              }
            />
            {required.kind === "jury" ? (
              <div className="px-1 pb-1 pt-3">
                <V3Progress value={(8 / 15) * 100} label="Jury progress" />
              </div>
            ) : null}
          </V3Surface>
        </V3Section>
      ) : (
        <V3Section title="Needs attention" meta={<V3StatusChip tone="success">Clear</V3StatusChip>}>
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">Nothing requires action</p>
            <p className="mt-1 text-xs leading-5 text-white/48">Solaris will surface the next official responsibility when it becomes actionable.</p>
          </V3Surface>
        </V3Section>
      )}

      {optional ? (
        <V3Section title="Optional now" meta={<V3StatusChip>Optional</V3StatusChip>}>
          <V3ActionCard title={optional.title} description={optional.description} tone="neutral" />
        </V3Section>
      ) : null}
    </V3Screen>
  );
}

function ExplorePreview() {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Explore Solaris"
        title="Discover the contest"
        description="Entities and stories live here. Results analysis stays in Results, keeping the global mental model deliberately boring in the best possible way."
      />
      <V3Surface level="glass" className="p-5">
        <p className="v3-kicker">Current edition</p>
        <h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">SSC 22</h2>
        <p className="mt-2 text-sm text-white/55">Tetlehamn · Pre-show · 66 delegations</p>
      </V3Surface>
      <V3Section title="Discover">
        <div className="v3-preview-grid">
          <V3ActionCard title="Countries" description="Delegations, entries and histories" tone="neutral" />
          <V3ActionCard title="Songs & artists" description="Meet the current field" tone="neutral" />
          <V3ActionCard title="Shows" description="Semi-finals, finals and running orders" tone="neutral" />
          <V3ActionCard title="Stories" description="Important Solaris moments" tone="neutral" />
        </div>
      </V3Section>
    </V3Screen>
  );
}

function ResultsPreview({ bootstrap }: { bootstrap: V3BootstrapProjection }) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Results"
        title="Outcome first"
        description="The official result is the payoff. Analysis stays discoverable without making the first screen feel like a statistics laboratory."
      />
      <V3Surface level="raised" className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="v3-kicker">Latest published</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.045em]">
              {bootstrap.experience.resultsPublic ? "SSC 22 Final" : "SSC 21 Final"}
            </h2>
          </div>
          <V3StatusChip tone="success">Official</V3StatusChip>
        </div>
        <div className="mt-5 space-y-2">
          <ResultPreviewRow rank={1} country="Winner" points="312" />
          <ResultPreviewRow rank={2} country="Runner-up" points="284" />
          <ResultPreviewRow rank={3} country="Third place" points="271" />
        </div>
      </V3Surface>
      <V3Section title="Explore this result" meta="Analysis second">
        <div className="v3-preview-grid">
          <V3ActionCard title="Scorechart" description="See the official points breakdown" tone="neutral" />
          <V3ActionCard title="Jury vs televote" description="Compare the two voting components" tone="neutral" />
        </div>
      </V3Section>
    </V3Screen>
  );
}

function MePreview() {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Me"
        title="Your Solaris identity"
        description="Me owns identity, history, receipts and preferences. Official contest work belongs in Participate, eliminating the old workspace overlap."
      />
      <V3Surface level="raised" className="p-5">
        <p className="v3-kicker">Delegation identity</p>
        <h2 className="mt-2 text-2xl font-bold tracking-[-0.045em]">Oland</h2>
        <p className="mt-1 text-sm text-white/52">Current edition · SSC 22</p>
      </V3Surface>
      <V3Section title="Your Solaris">
        <div className="v3-preview-grid">
          <V3ActionCard title="History" description="Past editions and roles" tone="neutral" />
          <V3ActionCard title="Receipts" description="Verified submission history" tone="neutral" />
          <V3ActionCard title="Following" description="Countries and updates you care about" tone="neutral" />
          <V3ActionCard title="Preferences" description="Notifications, appearance and accessibility" tone="neutral" />
        </div>
      </V3Section>
    </V3Screen>
  );
}

function V3Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="v3-surface v3-preview-stat">
      <span className="v3-preview-stat__value">{value}</span>
      <span className="v3-preview-stat__label">{label}</span>
    </div>
  );
}

function ResultPreviewRow({ rank, country, points }: { rank: number; country: string; points: string }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-xl border border-white/[0.055] bg-white/[0.025] px-3 py-2.5">
      <span className="w-7 text-center text-sm font-bold tabular-nums text-white/45">#{rank}</span>
      <span className="grid size-8 place-items-center rounded-lg bg-white/[0.055] text-xs font-bold text-white/55">SS</span>
      <span className="min-w-0 flex-1 text-sm font-semibold">{country}</span>
      <span className="text-sm font-bold tabular-nums">{points}</span>
    </div>
  );
}
