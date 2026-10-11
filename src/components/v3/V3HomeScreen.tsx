import { Radio } from "lucide-react";

import type { V3BootstrapProjection } from "@/lib/v3-bootstrap";
import type { V3ActionProjection } from "@/lib/v3-experience";
import {
  V3ActionCard,
  V3NowCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export type V3HomeContestView = {
  title: string;
  headline: string;
  meta?: string | null;
  stats?: readonly { value: string; label: string }[];
  liveHeadline?: string | null;
  resultsHeadline?: string | null;
};

export type V3HomeListItem = {
  id: string;
  title: string;
  description: string;
  to?: string;
};

export type V3HomeActionMeta = {
  progressLabel?: string | null;
  timingLabel?: string | null;
};

export type V3HomeScreenProps = {
  bootstrap: V3BootstrapProjection;
  greeting?: string | null;
  currentContest: V3HomeContestView;
  upcoming?: readonly V3HomeListItem[];
  latest?: readonly V3HomeListItem[];
  actionMeta?: Readonly<Record<string, V3HomeActionMeta>>;
  liveShowLabel?: string | null;
  resultsLabel?: string | null;
};

function urgencyTone(action: V3ActionProjection) {
  return action.urgency === "immediate" || action.urgency === "high"
    ? ("urgent" as const)
    : ("required" as const);
}

function actionMetaNodes(action: V3ActionProjection, meta?: V3HomeActionMeta) {
  const values = [meta?.progressLabel, meta?.timingLabel].filter(Boolean) as string[];
  if (!values.length) return undefined;

  return (
    <>
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </>
  );
}

function homeNowContent({
  bootstrap,
  greeting,
  actionMeta,
  liveShowLabel,
  resultsLabel,
}: Pick<
  V3HomeScreenProps,
  "bootstrap" | "greeting" | "actionMeta" | "liveShowLabel" | "resultsLabel"
>) {
  const primary = bootstrap.attention.primary;
  const edition = bootstrap.context.editionLabel ?? "Solaris";
  const show = liveShowLabel ?? "The current show";

  switch (bootstrap.home.primaryMode) {
    case "attention": {
      const count = bootstrap.attention.badgeCount;
      return {
        headerTitle: greeting ?? "What matters now",
        eyebrow: "Right now",
        title: `${count} thing${count === 1 ? "" : "s"} need your attention`,
        count: count as number | "✓",
        child: primary ? (
          <V3ActionCard
            title={primary.title}
            description={primary.description}
            tone={urgencyTone(primary)}
            to={primary.route}
            meta={actionMetaNodes(primary, actionMeta?.[primary.id])}
          />
        ) : null,
      };
    }
    case "show-day":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Today",
        title: `${show} starts soon`,
        count: "✓" as const,
        child: null,
      };
    case "live":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Live now",
        title: `${show} is live`,
        count: "✓" as const,
        child: null,
      };
    case "live-voting":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Live now",
        title: `${show} is live`,
        count: "✓" as const,
        child: (
          <V3ActionCard
            title="Voting is open"
            description="Follow the live show or open the optional public vote."
            icon={Radio}
            tone="neutral"
            to="/televoting"
          />
        ),
      };
    case "voting":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Right now",
        title: "Voting is open",
        count: "✓" as const,
        child: (
          <V3ActionCard
            title="Public voting"
            description="The current voting window is open."
            tone="neutral"
            to="/televoting"
          />
        ),
      };
    case "results":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Results",
        title: resultsLabel ?? `${edition} results are in`,
        count: "✓" as const,
        child: null,
      };
    case "results-hidden":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Results",
        title: `${edition} results are available`,
        count: "✓" as const,
        child: (
          <V3ActionCard
            title="Reveal results"
            description="Result spoilers are hidden until you choose to open them."
            tone="neutral"
            to="/results"
          />
        ),
      };
    case "post-edition":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Edition complete",
        title: `${edition} is complete`,
        count: "✓" as const,
        child: null,
      };
    case "planning":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Coming next",
        title: "A new Solaris edition is taking shape",
        count: "✓" as const,
        child: null,
      };
    case "cancelled":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Edition update",
        title: "This edition is not continuing",
        count: "✓" as const,
        child: null,
      };
    case "calm":
      return {
        headerTitle: greeting ?? "Solaris now",
        eyebrow: "Right now",
        title: "You're all caught up",
        count: "✓" as const,
        child: null,
      };
  }
}

function contestStatus(bootstrap: V3BootstrapProjection) {
  if (bootstrap.experience.resultsPublic) {
    return { label: "Results", tone: "success" as const };
  }
  if (bootstrap.experience.live) {
    return { label: "Live", tone: "live" as const };
  }
  if (bootstrap.experience.votingOpen) {
    return { label: "Voting", tone: "progress" as const };
  }
  return { label: "Current", tone: "progress" as const };
}

/**
 * Production-ready Home composition over V3BootstrapProjection.
 *
 * The screen owns no queries and performs no contest-state inference. Routes
 * can feed it data they already loaded while V3 rollout replaces presentation
 * independently from the existing data layer.
 */
export function V3HomeScreen({
  bootstrap,
  greeting,
  currentContest,
  upcoming = [],
  latest = [],
  actionMeta,
  liveShowLabel,
  resultsLabel,
}: V3HomeScreenProps) {
  const now = homeNowContent({
    bootstrap,
    greeting,
    actionMeta,
    liveShowLabel,
    resultsLabel,
  });
  const status = contestStatus(bootstrap);
  const contestHeadline = bootstrap.experience.resultsPublic
    ? currentContest.resultsHeadline ?? currentContest.headline
    : bootstrap.experience.live
      ? currentContest.liveHeadline ?? currentContest.headline
      : currentContest.headline;

  return (
    <V3Screen>
      <V3ScreenHeader
        title={now.headerTitle}
        description="What matters now, followed by the current contest, what comes next and the latest Solaris updates."
      />

      <V3NowCard eyebrow={now.eyebrow} title={now.title} count={now.count}>
        {now.child}
      </V3NowCard>

      <V3Section
        title="Current contest"
        meta={<V3StatusChip tone={status.tone}>{status.label}</V3StatusChip>}
      >
        <V3Surface level="raised" className="p-5">
          <p className="v3-kicker">{currentContest.title}</p>
          <h2 className="mt-2 text-[1.55rem] font-bold leading-[1.02] tracking-[-0.045em]">
            {contestHeadline}
          </h2>
          {currentContest.meta ? (
            <p className="mt-2 text-[0.78rem] leading-5 text-white/55">{currentContest.meta}</p>
          ) : null}
          {currentContest.stats?.length ? (
            <div className="mt-5 v3-preview-meta-grid">
              {currentContest.stats.slice(0, 4).map((stat) => (
                <div key={`${stat.label}:${stat.value}`} className="v3-surface v3-preview-stat">
                  <span className="v3-preview-stat__value">{stat.value}</span>
                  <span className="v3-preview-stat__label">{stat.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </V3Surface>
      </V3Section>

      <V3Section title="Coming up" meta={upcoming.length ? `Next ${Math.min(3, upcoming.length)}` : undefined}>
        {upcoming.length ? (
          <div className="v3-preview-grid">
            {upcoming.slice(0, 3).map((item) => (
              <V3ActionCard
                key={item.id}
                title={item.title}
                description={item.description}
                tone="neutral"
                to={item.to}
              />
            ))}
          </div>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">Nothing scheduled yet</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Upcoming Solaris events will appear here when they are public.
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section title="Latest" meta={latest.length ? "Latest 3" : undefined}>
        {latest.length ? (
          <div className="v3-preview-grid">
            {latest.slice(0, 3).map((item) => (
              <V3ActionCard
                key={item.id}
                title={item.title}
                description={item.description}
                tone="neutral"
                to={item.to}
              />
            ))}
          </div>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">No new updates</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Important Solaris updates will appear here without turning Home into an endless feed.
            </p>
          </V3Surface>
        )}
      </V3Section>
    </V3Screen>
  );
}
