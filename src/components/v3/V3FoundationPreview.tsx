import {
  Bell,
  Compass,
  Home,
  Search,
  Trophy,
  UserRound,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { SolarisTask } from "@/lib/participation-os";
import { projectV3Experience, type V3DomainSnapshot } from "@/lib/v3-domain-state";
import { projectV3Actions, projectV3Attention, type V3ActionProjection } from "@/lib/v3-experience";
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

const PREVIEW_NOW = Date.parse("2026-10-11T16:48:00.000Z");

type PreviewTab = "home" | "explore" | "participate" | "results" | "me";
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

const PREVIEW_DOMAIN: V3DomainSnapshot = {
  edition: "active",
  confirmation: "closed",
  entry: "verified",
  show: "scheduled",
  jury: "open",
  televote: "upcoming",
  results: "hidden",
  publication: "scheduled",
};

const PREVIEW_TASKS: readonly SolarisTask[] = [
  {
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
  },
  {
    id: "televote:ssc22-sf1",
    editionId: "22",
    kind: "televote",
    title: "Public voting",
    description: "Voting opens during the live show.",
    state: "upcoming",
    importance: "optional",
    blocking: false,
    actionRequired: false,
    opensAt: "2026-10-12T18:30:00.000Z",
    deadline: "2026-10-12T18:45:00.000Z",
    route: "/televoting",
    priority: 35,
    why: "Public televoting is optional participation, not an official delegation responsibility.",
  },
];

function urgencyTone(action: V3ActionProjection | null) {
  if (!action) return "neutral" as const;
  return action.urgency === "immediate" || action.urgency === "high"
    ? ("urgent" as const)
    : ("required" as const);
}

function experienceLabel(mode: ReturnType<typeof projectV3Experience>["mode"]) {
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
  const experience = useMemo(() => projectV3Experience(PREVIEW_DOMAIN), []);
  const actions = useMemo(() => projectV3Actions(PREVIEW_TASKS, PREVIEW_NOW), []);
  const attention = useMemo(() => projectV3Attention(actions), [actions]);

  return (
    <V3FoundationShell>
      <V3TopContext
        edition="SSC 22"
        phase={tab === "participate" ? "Jury phase" : experienceLabel(experience.mode)}
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

      {tab === "home" ? <HomePreview attention={attention} /> : null}
      {tab === "participate" ? <ParticipatePreview actions={actions} /> : null}
      {tab === "explore" ? <ExplorePreview /> : null}
      {tab === "results" ? <ResultsPreview /> : null}
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

function HomePreview({ attention }: { attention: ReturnType<typeof projectV3Attention> }) {
  const primary = attention.primary;
  const title = attention.badgeCount
    ? `${attention.badgeCount} thing${attention.badgeCount === 1 ? "" : "s"} need your attention`
    : "You're all caught up";

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Foundation preview"
        title={attention.badgeCount ? "Good evening" : "All caught up"}
        description="V3 keeps Home structurally stable while canonical state changes what deserves emphasis."
      />

      <V3NowCard eyebrow="Right now" title={title} count={attention.badgeCount || "✓"}>
        {primary ? (
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
        ) : null}
      </V3NowCard>

      <V3Section title="Current contest" meta={<V3StatusChip tone="progress">Pre-show</V3StatusChip>}>
        <V3Surface level="raised" className="p-5">
          <p className="v3-kicker">Solaris Song Contest 22</p>
          <h2 className="mt-2 text-[1.55rem] font-bold leading-[1.02] tracking-[-0.045em]">Semi-final 1 tomorrow</h2>
          <p className="mt-2 text-[0.78rem] leading-5 text-white/55">Tetlehamn · 20:00 CEST</p>
          <div className="mt-5 v3-preview-meta-grid">
            <V3Stat value="66" label="Delegations" />
            <V3Stat value="18" label="Semi-finalists" />
            <V3Stat value="20:00" label="Show time" />
            <V3Stat value="1 day" label="Until show" />
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

function ParticipatePreview({ actions }: { actions: readonly V3ActionProjection[] }) {
  const required = actions.find((action) => action.deliveryClass === "required" && action.actionRequired) ?? null;
  const optional = actions.find((action) => action.deliveryClass === "optional") ?? null;

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="SSC 22"
        title="Your participation"
        description="Responsibilities are separated from optional participation, so a public vote never competes visually with an official jury obligation."
      />

      <V3Section title="Your responsibilities" meta="3 of 4 complete">
        <V3Journey>
          <V3JourneyStep title="Confirmation" detail="Participation confirmed" state="complete" trailing="Done" />
          <V3JourneyStep title="Entry" detail="Submitted and verified" state="complete" trailing="Done" />
          <V3JourneyStep title="Media" detail="All required assets accepted" state="complete" trailing="Done" />
          <V3JourneyStep title="Jury" detail="Official Semi-final 1 ballot" state="active" trailing="8 / 15" />
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
            <div className="px-1 pb-1 pt-3">
              <V3Progress value={(8 / 15) * 100} label="Jury progress" />
            </div>
          </V3Surface>
        </V3Section>
      ) : null}

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

function ResultsPreview() {
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
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.045em]">SSC 21 Final</h2>
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
