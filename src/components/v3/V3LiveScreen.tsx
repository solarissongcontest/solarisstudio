import {
  ExternalLink,
  ListOrdered,
  Radio,
  RefreshCcw,
  Trophy,
  Vote,
} from "lucide-react";

import type { V3LiveExperience, V3PublicShowState } from "@/lib/v3-live";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3StatusTone,
} from "./V3Foundation";

export type V3LiveScreenProps = {
  edition?: {
    slug: string;
    label: string;
  } | null;
  experience: V3LiveExperience | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  degraded?: boolean;
};

function showStatePresentation(
  state: V3PublicShowState,
): { label: string; tone: V3StatusTone } {
  switch (state) {
    case "live":
      return { label: "Live", tone: "live" };
    case "voting":
      return { label: "Voting open", tone: "live" };
    case "results_pending":
      return { label: "Results pending", tone: "warning" };
    case "complete":
      return { label: "Complete", tone: "success" };
    case "starting_soon":
      return { label: "Starting soon", tone: "warning" };
    case "paused":
      return { label: "Paused", tone: "warning" };
    case "delayed":
      return { label: "Delayed", tone: "warning" };
    case "cancelled":
      return { label: "Cancelled", tone: "danger" };
    case "upcoming":
      return { label: "Upcoming", tone: "progress" };
  }
}

function freshnessLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Authoritative snapshot";
  return `Updated ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function liveMomentLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function liveTimingRows(experience: V3LiveExperience) {
  return [
    { label: "Scheduled start", value: experience.timing.scheduledStart },
    { label: "Live started", value: experience.timing.liveStartedAt },
    { label: "Voting opened", value: experience.voting.openedAt },
    { label: "Voting closed", value: experience.voting.closedAt },
    { label: "Results segment started", value: experience.timing.resultsStartedAt },
    { label: "Show ended", value: experience.timing.endedAt },
  ].filter(
    (row): row is { label: string; value: string } =>
      typeof row.value === "string" && row.value.length > 0,
  );
}

/**
 * Presentation-only Public V3 Live surface.
 *
 * Everything rendered here comes from the server-owned LiveExperience snapshot.
 * In particular, the screen does not infer a current performer from running
 * order position or elapsed wall-clock time when Solaris lacks that authority.
 */
export function V3LiveScreen({
  edition = null,
  experience,
  onRefresh,
  refreshing = false,
  degraded = false,
}: V3LiveScreenProps) {
  if (!experience) {
    return (
      <V3Screen>
        <V3ScreenHeader
          kicker="Live"
          title="No public show right now"
          description={
            edition
              ? `${edition.label} does not currently have a published show selected for Live.`
              : "A live experience will appear when Solaris has a published show to follow."
          }
          editorial
        />
        {edition ? (
          <V3Surface className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="v3-kicker">Edition context</p>
              <p className="mt-1 truncate text-sm font-semibold">{edition.label}</p>
            </div>
            <a
              href={`/editions/${edition.slug}`}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Open edition
            </a>
          </V3Surface>
        ) : null}
        {degraded ? (
          <V3Surface
            level="raised"
            className="border-amber-300/20 bg-amber-300/[0.055] p-4"
            data-v3-live-degraded-snapshot=""
          >
            <div role="status" aria-live="polite">
              <p className="text-sm font-semibold">Live connection interrupted</p>
              <p className="mt-1 text-xs leading-5 text-white/55">
                The last authoritative snapshot had no public show. That state may now be stale,
                so refresh to reconcile before relying on it.
              </p>
            </div>
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-50"
              >
                <RefreshCcw
                  className={`size-4 ${refreshing ? "motion-safe:animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {refreshing ? "Refreshing…" : "Retry refresh"}
              </button>
            ) : null}
          </V3Surface>
        ) : null}
        <V3Surface className="p-5">
          <div role="status">
            <p className="text-sm font-semibold">Nothing is live yet</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Show status comes from the canonical public contest state. Solaris
              will not invent a live session from a schedule alone.
            </p>
          </div>
        </V3Surface>
      </V3Screen>
    );
  }

  const presentation = showStatePresentation(experience.state);
  const exactPerformanceKnown = Boolean(experience.currentPerformance);
  const timingRows = liveTimingRows(experience);

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Live"
        title={experience.show.name}
        description={experience.description}
        editorial
      />

      {edition ? (
        <V3Surface className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="v3-kicker">Edition context</p>
            <p className="mt-1 truncate text-sm font-semibold">{edition.label}</p>
          </div>
          <a
            href={`/editions/${edition.slug}`}
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            Open edition
          </a>
        </V3Surface>
      ) : null}

      {degraded ? (
        <V3Surface
          level="raised"
          className="border-amber-300/20 bg-amber-300/[0.055] p-4"
          data-v3-live-degraded-snapshot=""
        >
          <div role="status" aria-live="polite">
            <p className="text-sm font-semibold">Live connection interrupted</p>
            <p className="mt-1 text-xs leading-5 text-white/55">
              Showing the last authoritative Solaris snapshot from {freshnessLabel(
                experience.freshness.updatedAt,
              ).replace(/^Updated /, "")}. Refresh to reconcile with the current show state.
            </p>
          </div>
        </V3Surface>
      ) : null}

      <V3Surface level="raised" className="overflow-hidden p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="v3-kicker">Current show state</p>
            <p className="mt-2 text-xl font-bold tracking-[-0.03em]">
              {experience.stateLabel}
            </p>
          </div>
          <V3StatusChip tone={presentation.tone}>
            {presentation.label}
          </V3StatusChip>
        </div>

        {exactPerformanceKnown && experience.currentPerformance ? (
          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
            <p className="v3-kicker">Now performing</p>
            <p className="mt-2 text-base font-semibold">
              {experience.currentPerformance.countryName}
            </p>
            <p className="mt-1 text-sm text-white/55">
              {[
                experience.currentPerformance.artist,
                experience.currentPerformance.song,
              ]
                .filter(Boolean)
                .join(" · ") || "Performance in progress"}
            </p>
          </div>
        ) : experience.state === "live" || experience.state === "voting" ? (
          <div
            className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"
            data-v3-live-truthful-uncertainty=""
          >
            <p className="text-sm font-semibold">Show live</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris does not currently have an authoritative performer cursor,
              so this screen will not guess who is on stage from elapsed time.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.7rem] text-white/42">
          <span>{freshnessLabel(experience.freshness.updatedAt)}</span>
          <span aria-hidden="true">·</span>
          <span className="break-all font-mono">
            {experience.freshness.stateVersion}
          </span>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCcw
                className={`size-4 ${refreshing ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
              />
              {refreshing ? "Refreshing…" : degraded ? "Retry refresh" : "Refresh"}
            </button>
          ) : null}
        </div>
      </V3Surface>

      {experience.reveal.state !== "hidden" ? (
        <V3Section
          title={experience.reveal.state === "complete" ? "Results reveal complete" : "Results reveal"}
          meta={`${experience.reveal.currentStep} of ${experience.reveal.totalSteps}`}
        >
          <V3Surface
            level="raised"
            className="p-5"
            data-v3-live-reveal-progress={experience.reveal.state}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="v3-kicker">Canonical reveal progress</p>
                <p className="mt-2 text-lg font-bold tracking-[-0.02em]">
                  {experience.reveal.state === "complete"
                    ? "Reveal complete"
                    : "Reveal in progress"}
                </p>
              </div>
              <V3StatusChip tone={experience.reveal.state === "complete" ? "success" : "live"}>
                {experience.reveal.state === "complete" ? "Complete" : "Live"}
              </V3StatusChip>
            </div>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]"
              role="progressbar"
              aria-label="Results reveal progress"
              aria-valuemin={0}
              aria-valuemax={experience.reveal.totalSteps}
              aria-valuenow={experience.reveal.currentStep}
            >
              <div
                className="h-full rounded-full bg-white/80 transition-[width] motion-reduce:transition-none"
                style={{
                  width: `${experience.reveal.totalSteps > 0
                    ? Math.min(100, (experience.reveal.currentStep / experience.reveal.totalSteps) * 100)
                    : 0}%`,
                }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-white/48">
              {experience.reveal.currentStep} of {experience.reveal.totalSteps} reveal steps have been confirmed by the server.
              Future reveal order stays private until each step is executed.
            </p>
          </V3Surface>
        </V3Section>
      ) : null}

      {experience.broadcast ||
      experience.voting.state === "open" ||
      experience.resultsPublished ? (
        <V3Section title="Do now">
          <div className="grid gap-3 sm:grid-cols-2">
            {experience.broadcast ? (
              <a
                href={experience.broadcast.href}
                target="_blank"
                rel="noreferrer"
                className="block rounded-[var(--v3-radius-xl)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <V3Surface
                  level="raised"
                  className="flex min-h-24 items-center gap-4 p-4"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.055]">
                    <Radio className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {experience.broadcast.label}
                    </span>
                    <span className="mt-1 block text-xs text-white/45">
                      Opens the official external broadcast
                    </span>
                  </span>
                  <ExternalLink
                    className="size-4 shrink-0 text-white/35"
                    aria-hidden="true"
                  />
                </V3Surface>
              </a>
            ) : null}

            {experience.voting.state === "open" ? (
              <V3ActionCard
                title="Vote now"
                description="Public voting is authoritatively open"
                icon={Vote}
                tone="neutral"
                to="/televoting"
              />
            ) : null}

            {experience.resultsPublished ? (
              <V3ActionCard
                title="Open official result"
                description="The result publication gate is open"
                icon={Trophy}
                tone="neutral"
                to={`/shows/${experience.show.id}?from=results`}
              />
            ) : null}
          </div>
        </V3Section>
      ) : null}

      {timingRows.length ? (
        <V3Section title="Show timing" meta="Authoritative snapshot">
          <V3Surface className="overflow-hidden">
            <dl className="divide-y divide-white/[0.06]">
              {timingRows.map((row) => (
                <div
                  key={row.label}
                  className="flex min-h-14 items-center justify-between gap-4 px-4 py-3"
                >
                  <dt className="text-xs font-medium text-white/48">{row.label}</dt>
                  <dd className="text-right text-sm font-semibold text-white/80">
                    {liveMomentLabel(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-white/[0.06] px-4 py-3 text-[0.7rem] leading-5 text-white/38">
              Times are displayed from the server snapshot. They do not independently advance
              show, voting or result state in this browser.
            </p>
          </V3Surface>
        </V3Section>
      ) : null}

      <V3Section
        title="Running order"
        meta={`${experience.runningOrder.length} ${
          experience.runningOrder.length === 1 ? "entry" : "entries"
        }`}
      >
        {experience.runningOrder.length ? (
          <ol className="grid gap-2" aria-label="Published running order">
            {experience.runningOrder.map((entry) => (
              <li key={entry.id}>
                <V3Surface className="flex min-h-16 items-center gap-3 px-4 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-sm font-bold tabular-nums text-white/58">
                    {entry.runningOrder ?? "–"}
                  </span>
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.055] text-[0.6rem] font-black text-white/70">
                    {entry.flagImage ? (
                      <img
                        src={entry.flagImage}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <ListOrdered className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {entry.countryName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-white/45">
                      {[entry.artist, entry.song].filter(Boolean).join(" · ") ||
                        "Entry details published"}
                    </span>
                  </span>
                </V3Surface>
              </li>
            ))}
          </ol>
        ) : (
          <V3Surface className="p-5">
            <p className="text-sm font-semibold">Running order not public</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris will show the order here only after the existing
              running-order publication gate opens.
            </p>
          </V3Surface>
        )}
      </V3Section>

      {experience.nextPerformance ? (
        <V3Section title="Next">
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">
              {experience.nextPerformance.countryName}
            </p>
            <p className="mt-1 text-xs text-white/48">
              {[
                experience.nextPerformance.artist,
                experience.nextPerformance.song,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </V3Surface>
        </V3Section>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {experience.stateLabel}. {freshnessLabel(experience.freshness.updatedAt)}.
      </p>
    </V3Screen>
  );
}