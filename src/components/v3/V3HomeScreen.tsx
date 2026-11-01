import { Link } from "@tanstack/react-router";
import { ChevronRight, Radio } from "lucide-react";
import type { ReactNode } from "react";

import type { V3BootstrapProjection } from "@/lib/v3-bootstrap";
import type { V3ActionProjection } from "@/lib/v3-experience";
import {
  V3ActionCard,
  V3NowCard,
  V3Screen,
  V3Section,
  V3StatusChip,
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
      return { headerTitle: "Solaris now", eyebrow: "Today", title: `${show} starts soon`, count: "✓" as const, child: null };
    case "live":
      return { headerTitle: "Solaris now", eyebrow: "Live now", title: `${show} is live`, count: "✓" as const, child: null };
    case "live-voting":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Live now",
        title: `${show} is live`,
        count: "✓" as const,
        child: <V3ActionCard title="Voting is open" description="Follow the live show or open the optional public vote." icon={Radio} tone="neutral" to="/televoting" />,
      };
    case "voting":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Right now",
        title: "Voting is open",
        count: "✓" as const,
        child: <V3ActionCard title="Public voting" description="The current voting window is open." tone="neutral" to="/televoting" />,
      };
    case "results":
      return { headerTitle: "Solaris now", eyebrow: "Results", title: resultsLabel ?? `${edition} results are in`, count: "✓" as const, child: null };
    case "results-hidden":
      return {
        headerTitle: "Solaris now",
        eyebrow: "Results",
        title: `${edition} results are available`,
        count: "✓" as const,
        child: <V3ActionCard title="Reveal results" description="Result spoilers are hidden until you choose to open them." tone="neutral" to="/results" />,
      };
    case "post-edition":
      return { headerTitle: "Solaris now", eyebrow: "Edition complete", title: `${edition} is complete`, count: "✓" as const, child: null };
    case "planning":
      return { headerTitle: "Solaris now", eyebrow: "Coming next", title: "A new Solaris edition is taking shape", count: "✓" as const, child: null };
    case "cancelled":
      return { headerTitle: "Solaris now", eyebrow: "Edition update", title: "This edition is not continuing", count: "✓" as const, child: null };
    case "calm":
      return { headerTitle: greeting ?? "Solaris now", eyebrow: "Right now", title: "You're all caught up", count: "✓" as const, child: null };
  }
}

function contestStatus(bootstrap: V3BootstrapProjection) {
  if (bootstrap.experience.resultsPublic) return { label: "Results", tone: "success" as const };
  if (bootstrap.experience.live) return { label: "Live", tone: "live" as const };
  if (bootstrap.experience.votingOpen) return { label: "Voting", tone: "progress" as const };
  return { label: "Current", tone: "progress" as const };
}

function HomeListRow({ item }: { item: V3HomeListItem }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{item.title}</span>
        <span className="mt-1 block text-xs leading-5 text-white/46">{item.description}</span>
      </span>
      {item.to ? <ChevronRight className="size-4 shrink-0 text-white/24" aria-hidden="true" /> : null}
    </>
  );

  return item.to ? (
    <Link
      to={item.to as any}
      className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {body}
    </Link>
  ) : (
    <div className="flex min-h-16 items-center gap-3 py-3">{body}</div>
  );
}

function FlatList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">{children}</div>;
}

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
  const now = homeNowContent({ bootstrap, greeting, actionMeta, liveShowLabel, resultsLabel });
  const status = contestStatus(bootstrap);
  const contestHeadline = bootstrap.experience.resultsPublic
    ? currentContest.resultsHeadline ?? currentContest.headline
    : bootstrap.experience.live
      ? currentContest.liveHeadline ?? currentContest.headline
      : currentContest.headline;

  return (
    <V3Screen>
      <header className="mb-5" data-v3-home-header="">
        <p className="v3-kicker">Home</p>
        <h1 className="mt-2 text-[clamp(1.85rem,8vw,2.6rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
          {now.headerTitle}
        </h1>
      </header>

      <V3NowCard eyebrow={now.eyebrow} title={now.title} count={now.count}>
        {now.child}
      </V3NowCard>

      <V3Section
        title="Current contest"
        meta={<V3StatusChip tone={status.tone}>{status.label}</V3StatusChip>}
      >
        <article className="border-l-2 border-[var(--v3-accent)] pl-4" data-v3-home-current-contest="">
          <p className="v3-kicker">{currentContest.title}</p>
          <h2 className="mt-2 max-w-[22ch] text-[1.45rem] font-semibold leading-[1.04] tracking-[-0.04em]">
            {contestHeadline}
          </h2>
          {currentContest.meta ? (
            <p className="mt-2 text-[0.78rem] leading-5 text-white/50">{currentContest.meta}</p>
          ) : null}
          {currentContest.stats?.length ? (
            <dl className="mt-4 grid grid-cols-2 border-y border-white/[0.07] sm:grid-cols-4 sm:divide-x sm:divide-white/[0.07]">
              {currentContest.stats.slice(0, 4).map((stat) => (
                <div key={`${stat.label}:${stat.value}`} className="py-3 sm:px-3 sm:first:pl-0 sm:last:pr-0">
                  <dd className="text-lg font-bold tabular-nums tracking-[-0.03em]">{stat.value}</dd>
                  <dt className="mt-1 text-[0.65rem] font-semibold text-white/40">{stat.label}</dt>
                </div>
              ))}
            </dl>
          ) : null}
        </article>
      </V3Section>

      <V3Section title="Coming up" meta={upcoming.length ? `Next ${Math.min(3, upcoming.length)}` : undefined}>
        {upcoming.length ? (
          <FlatList>
            {upcoming.slice(0, 3).map((item) => <HomeListRow key={item.id} item={item} />)}
          </FlatList>
        ) : (
          <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">Nothing public is scheduled yet.</p>
        )}
      </V3Section>

      <V3Section title="Latest" meta={latest.length ? "Latest 3" : undefined}>
        {latest.length ? (
          <FlatList>
            {latest.slice(0, 3).map((item) => <HomeListRow key={item.id} item={item} />)}
          </FlatList>
        ) : (
          <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">No new Solaris updates.</p>
        )}
      </V3Section>
    </V3Screen>
  );
}
